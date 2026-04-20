use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::{Context, Result};
use base64::Engine;
use entity::certificate_templates;
use image::GenericImageView;

use crate::services::font_loader::FontDatabase;
use crate::services::svg_generator::generate_svg;
use crate::services::svg_renderer::{svg_to_jpeg, svg_to_png, svg_to_png_with_dpi};
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
    // Build font database
    let fonts_dir = PathBuf::from(&state.settings.storage.uploads_dir).join("fonts");
    let font_db = if fonts_dir.exists() {
        FontDatabase::with_custom_fonts(&fonts_dir).await?
    } else {
        FontDatabase::new()
    };
    
    // Get canvas data
    let canvas = layout
        .canvas
        .clone()
        .unwrap_or_else(|| crate::services::templates::default_canvas_for_layout(layout));
    
    // Load background as base64 data URL
    let background_src = load_background_data_url(state, template).await?;
    
    // Generate SVG
    let svg = generate_svg(
        layout.page_width,
        layout.page_height,
        background_src.as_deref(),
        &canvas,
        &binding_values,
    );
    
    // Render SVG to PNG at 2x scale for better quality
    let png_bytes = svg_to_png(&svg, 2.0, &font_db)
        .context("Failed to render SVG to PNG")?;
    
    Ok(png_bytes)
}

/// Render scene to JPEG
pub async fn render_scene_jpeg(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
    layout: &TemplateLayoutData,
    _preview_name: &str,
    binding_values: HashMap<String, String>,
    quality: u8,
) -> Result<Vec<u8>> {
    let fonts_dir = PathBuf::from(&state.settings.storage.uploads_dir).join("fonts");
    let font_db = if fonts_dir.exists() {
        FontDatabase::with_custom_fonts(&fonts_dir).await?
    } else {
        FontDatabase::new()
    };
    
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
    
    let jpeg_bytes = svg_to_jpeg(&svg, 2.0, quality, &font_db)
        .context("Failed to render SVG to JPEG")?;
    
    Ok(jpeg_bytes)
}

/// Render scene with specific DPI setting
pub async fn render_scene_with_dpi(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
    layout: &TemplateLayoutData,
    _preview_name: &str,
    binding_values: HashMap<String, String>,
    dpi: f32,
) -> Result<Vec<u8>> {
    let fonts_dir = PathBuf::from(&state.settings.storage.uploads_dir).join("fonts");
    let font_db = if fonts_dir.exists() {
        FontDatabase::with_custom_fonts(&fonts_dir).await?
    } else {
        FontDatabase::new()
    };
    
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
    
    let png_bytes = svg_to_png_with_dpi(&svg, dpi, &font_db)
        .context("Failed to render SVG with DPI")?;
    
    Ok(png_bytes)
}

/// Build PDF from rendered PNG using the existing PDF pipeline
pub fn build_pdf_from_png(png_bytes: &[u8], page_width: i32, page_height: i32) -> Result<Vec<u8>> {
    use crate::services::certificates::PdfBackground;
    use crate::services::fonts::ResolvedFont;
    
    // Compress PNG data using flate2
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    use std::io::Write;
    encoder.write_all(png_bytes)
        .context("Failed to compress PNG data")?;
    let compressed = encoder.finish()
        .context("Failed to finish compression")?;
    
    // Get image dimensions
    let img = image::load_from_memory(png_bytes)
        .context("Failed to load image from memory")?;
    let (width, height) = img.dimensions();
    
    // Create PDF background
    let background = PdfBackground {
        width,
        height,
        filter: "FlateDecode",
        bytes: compressed,
    };
    
    // Build PDF using existing function
    crate::services::certificates::build_pdf_document(
        page_width.max(1) as f32,
        page_height.max(1) as f32,
        "", // No additional text content needed - it's in the PNG
        Some(&background),
        &ResolvedFont::Builtin(printpdf::BuiltinFont::Helvetica),
    )
}

async fn load_background_data_url(
    state: &crate::state::AppState,
    template: &certificate_templates::Model,
) -> Result<Option<String>> {
    match template.source_kind.to_ascii_lowercase().as_str() {
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
            Ok(Some(format!("data:{content_type};base64,{encoded}")))
        }
        _ => Ok(None),
    }
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
