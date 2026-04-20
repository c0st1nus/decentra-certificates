use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use fontdb::Database;
use tokio::fs;

/// Font database wrapper for managing loaded fonts
pub struct FontDatabase {
    pub db: Arc<Database>,
}

impl FontDatabase {
    /// Creates a new font database with system fonts loaded
    pub fn new() -> Self {
        let mut db = Database::new();
        
        // Load system fonts
        db.load_system_fonts();
        
        Self {
            db: Arc::new(db),
        }
    }
    
    /// Creates a font database and loads custom fonts from a directory
    pub async fn with_custom_fonts(fonts_dir: &Path) -> Result<Self> {
        let mut db = Database::new();
        
        // Load system fonts first
        db.load_system_fonts();
        
        // Load custom fonts from directory, but skip invalid cached files.
        if fonts_dir.exists() {
            for entry in std::fs::read_dir(fonts_dir).context("Failed to read fonts directory")? {
                let entry = entry.context("Failed to read font entry")?;
                let path = entry.path();
                if !path.is_file() || !looks_like_font_file(&path) {
                    continue;
                }

                let _ = db.load_font_file(&path);
            }
        }
        
        Ok(Self {
            db: Arc::new(db),
        })
    }
    
    /// Check if a font family is available
    pub fn has_font(&self, family: &str) -> bool {
        // Query the database for the font family
        let families: Vec<_> = self.db.faces()
            .filter_map(|face| face.families.first().map(|(name, _)| name.clone()))
            .collect();
        
        families.iter().any(|name| name.eq_ignore_ascii_case(family))
    }
    
    /// Get list of available font families
    pub fn available_families(&self) -> Vec<String> {
        let mut families: Vec<String> = self.db.faces()
            .filter_map(|face| face.families.first().map(|(name, _)| name.clone()))
            .collect();
        
        families.sort();
        families.dedup();
        families
    }
}

fn looks_like_font_file(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };

    let supported = matches!(ext.to_ascii_lowercase().as_str(), "ttf" | "otf" | "ttc");
    if !supported {
        return false;
    }

    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };

    if bytes.starts_with(b"<!DOCTYPE html") || bytes.starts_with(b"<html") || bytes.starts_with(b"<!doctype html") {
        return false;
    }

    bytes.starts_with(&[0x00, 0x01, 0x00, 0x00])
        || bytes.starts_with(b"OTTO")
        || bytes.starts_with(b"ttcf")
}

/// Google Fonts loader for downloading and caching fonts
pub struct GoogleFontsLoader {
    cache_dir: std::path::PathBuf,
    client: reqwest::Client,
}

impl GoogleFontsLoader {
    /// Common Google Fonts that we want to support
    const GOOGLE_FONTS: &[(&str, &str)] = &[
        ("Outfit", "https://fonts.google.com/download?family=Outfit"),
        ("Inter", "https://fonts.google.com/download?family=Inter"),
        ("Roboto", "https://fonts.google.com/download?family=Roboto"),
        ("Open+Sans", "https://fonts.google.com/download?family=Open+Sans"),
        ("Lato", "https://fonts.google.com/download?family=Lato"),
        ("Montserrat", "https://fonts.google.com/download?family=Montserrat"),
        ("Poppins", "https://fonts.google.com/download?family=Poppins"),
    ];
    
    pub fn new(cache_dir: std::path::PathBuf) -> Self {
        Self {
            cache_dir,
            client: reqwest::Client::new(),
        }
    }
    
    /// Ensure a font is downloaded and available
    pub async fn ensure_font(&self, family: &str) -> Result<()> {
        // Check if already cached
        let font_path = self.cache_dir.join(format!("{}.ttf", family.replace(' ', "")));
        if font_path.exists() {
            return Ok(());
        }
        
        // Create cache directory if needed
        fs::create_dir_all(&self.cache_dir).await
            .context("Failed to create fonts cache directory")?;
        
        // Try to find in Google Fonts list
        let font_url = Self::GOOGLE_FONTS
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(family))
            .map(|(_, url)| *url);
        
        if let Some(url) = font_url {
            self.download_font(family, url, &font_path).await?;
        } else {
            // Try alternative approach - download from fonts.google.com API
            self.download_from_google_api(family, &font_path).await?;
        }
        
        Ok(())
    }
    
    /// Download all common Google Fonts
    pub async fn preload_common_fonts(&self) -> Result<HashMap<String, bool>> {
        let mut results = HashMap::new();
        
        for (family, _) in Self::GOOGLE_FONTS {
            let result = self.ensure_font(family).await.is_ok();
            results.insert(family.to_string(), result);
        }
        
        Ok(results)
    }
    
    async fn download_font(&self, family: &str, url: &str, path: &Path) -> Result<()> {
        // Download font file
        let response = self.client.get(url)
            .send()
            .await
            .context(format!("Failed to download font {} from {}", family, url))?;
        
        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Failed to download font {}: HTTP {}",
                family,
                response.status()
            ));
        }
        
        let bytes = response.bytes()
            .await
            .context("Failed to read font response")?;
        
        fs::write(path, &bytes)
            .await
            .context("Failed to write font file")?;
        
        Ok(())
    }
    
    async fn download_from_google_api(&self, family: &str, path: &Path) -> Result<()> {
        // Use Google Fonts API to get the font
        // Format: https://fonts.googleapis.com/css2?family={family}:wght@400;700
        let css_url = format!(
            "https://fonts.googleapis.com/css2?family={}:wght@100;200;300;400;500;600;700;800;900",
            family.replace(' ', "+")
        );
        
        let css_response = self.client.get(&css_url)
            .send()
            .await
            .context("Failed to fetch font CSS")?;
        
        if !css_response.status().is_success() {
            return Err(anyhow::anyhow!("Font {} not found on Google Fonts", family));
        }
        
        let css = css_response.text().await
            .context("Failed to read font CSS")?;
        
        // Extract font URL from CSS
        let font_url = css.lines()
            .find(|line| line.contains("url("))
            .and_then(|line| {
                let start = line.find("url(")? + 4;
                let end = line[start..].find(')')? + start;
                Some(line[start..end].trim_matches('"').trim_matches('\''))
            })
            .ok_or_else(|| anyhow::anyhow!("Could not extract font URL from CSS"))?;
        
        // Download the actual font file
        let font_response = self.client.get(font_url)
            .send()
            .await
            .context("Failed to download font file")?;
        
        let font_bytes = font_response.bytes().await
            .context("Failed to read font bytes")?;
        
        fs::write(path, &font_bytes)
            .await
            .context("Failed to write font file")?;
        
        Ok(())
    }
}

/// Get default font family fallbacks
pub fn font_fallback_chain(requested: &str) -> Vec<&str> {
    match requested.to_lowercase().as_str() {
        "outfit" => vec!["Outfit", "Helvetica", "Arial", "sans-serif"],
        "inter" => vec!["Inter", "Helvetica", "Arial", "sans-serif"],
        "helvetica" => vec!["Helvetica", "Arial", "sans-serif"],
        "arial" => vec!["Arial", "Helvetica", "sans-serif"],
        "times new roman" => vec!["Times New Roman", "Times", "serif"],
        "georgia" => vec!["Georgia", "Times New Roman", "serif"],
        "courier new" => vec!["Courier New", "Courier", "monospace"],
        "roboto" => vec!["Roboto", "Helvetica", "Arial", "sans-serif"],
        "open sans" => vec!["Open Sans", "Helvetica", "Arial", "sans-serif"],
        "lato" => vec!["Lato", "Helvetica", "Arial", "sans-serif"],
        "montserrat" => vec!["Montserrat", "Helvetica", "Arial", "sans-serif"],
        "poppins" => vec!["Poppins", "Helvetica", "Arial", "sans-serif"],
        _ => vec![requested, "Helvetica", "Arial", "sans-serif"],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_font_database_new() {
        let db = FontDatabase::new();
        let families = db.available_families();
        // Should have at least some system fonts
        assert!(!families.is_empty());
    }
    
    #[test]
    fn test_font_fallback_chain() {
        let fallbacks = font_fallback_chain("Outfit");
        assert_eq!(fallbacks[0], "Outfit");
        assert_eq!(fallbacks[1], "Helvetica");
        
        let fallbacks = font_fallback_chain("Arial");
        assert_eq!(fallbacks[0], "Arial");
    }
    
    #[test]
    fn test_google_fonts_loader_creation() {
        let loader = GoogleFontsLoader::new(std::path::PathBuf::from("/tmp/fonts"));
        assert_eq!(loader.cache_dir, std::path::PathBuf::from("/tmp/fonts"));
    }
}
