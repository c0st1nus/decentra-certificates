use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use base64::Engine;
use entity::certificate_templates;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::services::pdf_renderer;
use crate::services::svg_generator::generate_svg;
use crate::services::svg_renderer::{svg_to_jpeg, svg_to_png, svg_to_png_with_dpi, svg_to_rgb};
use crate::services::templates::TemplateLayoutData;

/// Render scene to PNG using SVG pipeline (replaces Bun/Chrome)
///
/// # Arguments
/// * `state` - Application state with storage access
/// * `template` - Template model with background info
/// * `layout` - Layout data with canvas layers
/// * `preview_name` - Name for preview
/// * `binding_values` - Key-value pairs for template placeholders
///
/// # Returns
/// PNG bytes
pub async fn render_scene_png(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
    layout: &TemplateLayoutData,
    _preview_name: &str,
    binding_values: HashMap<String, String>,
) -> Result<Vec<u8>> {
    let background_src = load_background_data_url(state, template).await?;
    let svg_template =
        get_or_build_svg_template(state, template, layout, background_src.as_deref()).await?;
    let svg = apply_svg_bindings(svg_template.as_ref(), &binding_values);

    let _permit = state
        .render_semaphore
        .clone()
        .acquire_owned()
        .await
        .context("render semaphore closed")?;
    let font_db = Arc::clone(&state.font_db);
    let preview_scale = state.settings.preview_render_scale.max(0.5);
    let rendered =
        tokio::task::spawn_blocking(move || svg_to_png(&svg, preview_scale, font_db.as_ref()))
            .await
            .context("PNG render task panicked")??;

    Ok(rendered.bytes)
}

/// Render scene to JPEG
#[allow(dead_code)]
pub async fn render_scene_jpeg(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
    layout: &TemplateLayoutData,
    _preview_name: &str,
    binding_values: HashMap<String, String>,
    quality: u8,
) -> Result<Vec<u8>> {
    let canvas = layout
        .canvas
        .clone()
        .unwrap_or_else(|| crate::services::templates::default_canvas_for_layout(layout));

    let background_src = load_background_data_url(state, template).await?;

    let svg = generate_svg(
        layout.page_width,
        layout.page_height,
        background_src.as_deref(),
        &canvas,
        &binding_values,
    );

    let _permit = state
        .render_semaphore
        .clone()
        .acquire_owned()
        .await
        .context("render semaphore closed")?;
    let font_db = Arc::clone(&state.font_db);
    let jpeg_bytes =
        tokio::task::spawn_blocking(move || svg_to_jpeg(&svg, 2.0, quality, font_db.as_ref()))
            .await
            .context("JPEG render task panicked")??;

    Ok(jpeg_bytes)
}

/// Render scene with specific DPI setting
#[allow(dead_code)]
pub async fn render_scene_with_dpi(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
    layout: &TemplateLayoutData,
    _preview_name: &str,
    binding_values: HashMap<String, String>,
    dpi: f32,
) -> Result<Vec<u8>> {
    let canvas = layout
        .canvas
        .clone()
        .unwrap_or_else(|| crate::services::templates::default_canvas_for_layout(layout));

    let background_src = load_background_data_url(state, template).await?;

    let svg = generate_svg(
        layout.page_width,
        layout.page_height,
        background_src.as_deref(),
        &canvas,
        &binding_values,
    );

    let _permit = state
        .render_semaphore
        .clone()
        .acquire_owned()
        .await
        .context("render semaphore closed")?;
    let font_db = Arc::clone(&state.font_db);
    let png_bytes =
        tokio::task::spawn_blocking(move || svg_to_png_with_dpi(&svg, dpi, font_db.as_ref()))
            .await
            .context("DPI render task panicked")??;

    Ok(png_bytes)
}

pub async fn render_scene_pdf(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
    layout: &TemplateLayoutData,
    binding_values: HashMap<String, String>,
) -> Result<Vec<u8>> {
    let background_src = load_background_data_url(state, template).await?;
    let svg_template =
        get_or_build_svg_template(state, template, layout, background_src.as_deref()).await?;
    let svg = apply_svg_bindings(svg_template.as_ref(), &binding_values);

    let _permit = state
        .render_semaphore
        .clone()
        .acquire_owned()
        .await
        .context("render semaphore closed")?;
    let font_db = Arc::clone(&state.font_db);
    let page_width = layout.page_width;
    let page_height = layout.page_height;
    let render_scale = state.settings.certificate_render_scale.max(0.5);
    tokio::task::spawn_blocking(move || {
        match pdf_renderer::svg_to_vector_pdf(&svg, font_db.as_ref()) {
            Ok(pdf) => Ok(pdf),
            Err(err) => {
                tracing::warn!(error = %err, "vector PDF render failed, falling back to raster PDF");
                let rendered = svg_to_rgb(&svg, render_scale, font_db.as_ref())?;
                build_pdf_from_rgb(
                    &rendered.rgb_bytes,
                    page_width,
                    page_height,
                    rendered.width,
                    rendered.height,
                )
            }
        }
    })
    .await
    .context("PDF render task panicked")?
}

/// Build PDF from rendered RGB bitmap.
pub fn build_pdf_from_rgb(
    rgb_bytes: &[u8],
    page_width: i32,
    page_height: i32,
    image_width: u32,
    image_height: u32,
) -> Result<Vec<u8>> {
    use crate::services::certificates::PdfBackground;

    // Compress raw RGB bytes for PDF image stream.
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    use std::io::Write;
    encoder
        .write_all(rgb_bytes)
        .context("Failed to compress RGB bitmap data")?;
    let compressed = encoder.finish().context("Failed to finish compression")?;

    // Create PDF background
    let background = PdfBackground {
        width: image_width,
        height: image_height,
        filter: "FlateDecode",
        bytes: compressed,
    };

    // Build PDF using existing function
    crate::services::certificates::build_pdf_document(
        page_width.max(1) as f32,
        page_height.max(1) as f32,
        "",
        Some(&background),
    )
}

async fn load_background_data_url(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
) -> Result<Option<String>> {
    {
        let cache = state.template_background_cache.read().await;
        if let Some(cached) = cache.get(&template.id) {
            return Ok(cached.as_ref().map(|value| value.as_ref().clone()));
        }
    }

    let data_url = match template.source_kind.to_ascii_lowercase().as_str() {
        "png" | "jpg" | "jpeg" => {
            let bytes = state
                .storage
                .get_object(&template.source_path)
                .await
                .with_context(|| {
                    format!(
                        "failed to load template source for scene render: {}",
                        template.source_path
                    )
                })?;
            let content_type = match template.source_kind.to_ascii_lowercase().as_str() {
                "png" => "image/png",
                _ => "image/jpeg",
            };
            let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
            Some(format!("data:{content_type};base64,{encoded}"))
        }
        _ => None,
    };

    let mut cache = state.template_background_cache.write().await;
    cache.insert(template.id, data_url.clone().map(Arc::new));
    Ok(data_url)
}

async fn get_or_build_svg_template(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
    layout: &TemplateLayoutData,
    background_src: Option<&str>,
) -> Result<Arc<String>> {
    let cache_key = svg_cache_key(template.id, layout)?;
    {
        let cache = state.template_svg_cache.read().await;
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(Arc::clone(cached));
        }
    }

    let empty_bindings = HashMap::new();
    let canvas = layout
        .canvas
        .clone()
        .unwrap_or_else(|| crate::services::templates::default_canvas_for_layout(layout));
    let svg_template = Arc::new(generate_svg(
        layout.page_width,
        layout.page_height,
        background_src,
        &canvas,
        &empty_bindings,
    ));

    let mut cache = state.template_svg_cache.write().await;
    let cached = cache
        .entry(cache_key)
        .or_insert_with(|| Arc::clone(&svg_template));
    Ok(Arc::clone(cached))
}

fn svg_cache_key(template_id: Uuid, layout: &TemplateLayoutData) -> Result<String> {
    let layout_bytes = serde_json::to_vec(layout)
        .context("failed to serialize template layout for SVG cache key")?;
    let layout_hash = Sha256::digest(layout_bytes);
    Ok(format!("{template_id}:{layout_hash:x}"))
}

fn apply_svg_bindings(svg_template: &str, binding_values: &HashMap<String, String>) -> String {
    let mut svg = svg_template.to_owned();
    for (key, value) in binding_values {
        let placeholder = format!("{{{{{key}}}}}");
        let escaped = escape_svg_text(value);
        svg = svg.replace(&placeholder, &escaped);
    }
    svg
}

fn escape_svg_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::templates::{TemplateCanvasData, TemplateCanvasLayer, TemplateCanvasText};

    #[test]
    fn test_generate_svg_simple() {
        let canvas = TemplateCanvasData {
            version: 1,
            layers: vec![TemplateCanvasLayer {
                id: "test".to_string(),
                name: "Test".to_string(),
                kind: "text".to_string(),
                role: None,
                x: 100,
                y: 100,
                width: 200,
                height: 50,
                rotation: 0,
                opacity: 100,
                visible: true,
                locked: false,
                text: Some(TemplateCanvasText {
                    content: "Hello World".to_string(),
                    binding: None,
                    font_family: "Arial".to_string(),
                    font_size: 24,
                    font_color_hex: "#000000".to_string(),
                    text_align: "left".to_string(),
                    vertical_align: "top".to_string(),
                    auto_shrink: false,
                    font_weight: 400,
                    letter_spacing: 0,
                    line_height: 120,
                    background_color_hex: None,
                }),
                image: None,
            }],
        };

        let bindings = HashMap::new();
        let svg = generate_svg(800, 600, None, &canvas, &bindings);

        assert!(svg.contains("<svg"));
        assert!(svg.contains("Hello World"));
        assert!(svg.contains("Arial"));
    }
}
