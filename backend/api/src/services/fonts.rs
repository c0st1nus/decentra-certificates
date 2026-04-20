use anyhow::{Result, anyhow};
use printpdf::BuiltinFont;
use std::sync::Arc;

pub enum ResolvedFont {
    Builtin(BuiltinFont),
    External(Arc<Vec<u8>>),
}

pub fn resolve_base14(font_family: &str) -> Option<BuiltinFont> {
    match font_family.to_lowercase().as_str() {
        "helvetica" | "arial" | "helvetica neue" | "verdana" | "trebuchet ms" | "outfit" => {
            Some(BuiltinFont::Helvetica)
        }
        "times-roman" | "times new roman" | "times" | "georgia" => Some(BuiltinFont::TimesRoman),
        "courier" | "courier new" => Some(BuiltinFont::Courier),
        "symbol" => Some(BuiltinFont::Symbol),
        "zapf dingbats" | "zapfdingbats" => Some(BuiltinFont::ZapfDingbats),
        _ => None,
    }
}

pub async fn get_or_download_font(
    state: &crate::state::AppState,
    font_family: &str,
) -> Result<ResolvedFont> {
    let normalized = font_family.trim().to_lowercase();

    // Instead of using afm metrics for builtin fonts (which cause slight offset),
    // we map common builtin fonts to Google metric-compatible equivalents
    // so we can download their TTF and get exact rusttype centering!
    let google_equivalent = match normalized.as_str() {
        "arial" | "helvetica" | "helvetica neue" => "Arimo",
        "times new roman" | "times-roman" | "times" | "georgia" => "Tinos",
        "courier" | "courier new" => "Cousine",
        _ => font_family.trim(),
    };

    let cache_key = google_equivalent.to_string();

    // 1. Check RAM cache
    {
        let cache = state.font_cache.read().await;
        if let Some(bytes) = cache.get(&cache_key) {
            return Ok(ResolvedFont::External(Arc::clone(bytes)));
        }
    }

    // 2. Check S3 / Storage
    let s3_path = format!("fonts/{}.ttf", cache_key.replace(" ", ""));
    if let Ok(bytes) = state.storage.get_object(&s3_path).await {
        let arc_bytes = Arc::new(bytes);
        let mut cache = state.font_cache.write().await;
        cache.insert(cache_key.clone(), Arc::clone(&arc_bytes));
        return Ok(ResolvedFont::External(arc_bytes));
    }

    // 3. Download from Google Fonts
    tracing::info!(
        "Downloading TTF for {} (equivalent of {}) from Google Fonts...",
        google_equivalent,
        font_family
    );
    match download_google_font(google_equivalent).await {
        Ok(bytes) => {
            let arc_bytes = Arc::new(bytes.clone());

            // Save to S3 for future
            let _ = state
                .storage
                .put_object(&s3_path, bytes, Some("font/ttf"))
                .await;

            // Save to RAM
            let mut cache = state.font_cache.write().await;
            cache.insert(cache_key, Arc::clone(&arc_bytes));

            Ok(ResolvedFont::External(arc_bytes))
        }
        Err(err) => {
            tracing::warn!(
                "Failed to download Google Font '{}': {}. Falling back to Base14.",
                google_equivalent,
                err
            );
            if let Some(builtin) = resolve_base14(font_family) {
                Ok(ResolvedFont::Builtin(builtin))
            } else {
                Ok(ResolvedFont::Builtin(BuiltinFont::Helvetica))
            }
        }
    }
}

async fn download_google_font(family: &str) -> Result<Vec<u8>> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://fonts.googleapis.com/css2?family={}",
        family.trim().replace(" ", "+")
    );

    // We send an old Safari User-Agent. Google Fonts detects this and
    // returns a pure .ttf URL instead of .woff2.
    let user_agent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";

    let css_response = client
        .get(&url)
        .header("User-Agent", user_agent)
        .send()
        .await?
        .text()
        .await?;

    let re = regex::Regex::new(r"url\((https://[^)]+\.ttf)\)")?;
    let ttf_url = re
        .captures(&css_response)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str())
        .ok_or_else(|| anyhow!("Could not extract TTF URL for font '{}'", family))?;

    let ttf_bytes = client.get(ttf_url).send().await?.bytes().await?;
    Ok(ttf_bytes.to_vec())
}
