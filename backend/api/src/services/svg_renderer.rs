use std::sync::Arc;

use anyhow::{Context, Result};
use jpeg_encoder::{ColorType, Encoder};
use resvg::usvg::{Options, Tree};
use resvg::tiny_skia::{Pixmap, Transform};

use crate::services::font_loader::FontDatabase;

pub struct RenderedImage {
    pub bytes: Vec<u8>,
    pub rgb_bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

fn render_svg(svg_data: &str, scale: f32, font_db: &FontDatabase) -> Result<(Pixmap, u32, u32)> {
    let options = Options {
        fontdb: Arc::clone(&font_db.db),
        ..Options::default()
    };

    let tree = Tree::from_str(svg_data, &options).context("Failed to parse SVG")?;
    let size = tree.size();
    let width = (size.width() * scale) as u32;
    let height = (size.height() * scale) as u32;

    let mut pixmap = Pixmap::new(width, height).context("Failed to create pixmap - invalid dimensions")?;
    let transform = Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    Ok((pixmap, width, height))
}

fn pixmap_to_rgb(pixmap: &Pixmap) -> Vec<u8> {
    pixmap
        .data()
        .chunks_exact(4)
        .flat_map(|chunk| [chunk[0], chunk[1], chunk[2]])
        .collect()
}

/// Renders an SVG string to PNG bytes
/// 
/// # Arguments
/// * `svg_data` - The SVG string to render
/// * `scale` - Scale factor (1.0 = original size, 2.0 = 2x for high DPI)
/// * `font_db` - Font database for text rendering
/// 
/// # Returns
/// PNG encoded bytes
pub fn svg_to_png(svg_data: &str, scale: f32, font_db: &FontDatabase) -> Result<RenderedImage> {
    let (pixmap, width, height) = render_svg(svg_data, scale, font_db)?;
    let rgb_bytes = pixmap_to_rgb(&pixmap);
    let png_bytes = pixmap.encode_png().context("Failed to encode PNG")?;

    Ok(RenderedImage {
        bytes: png_bytes,
        rgb_bytes,
        width,
        height,
    })
}

/// Renders an SVG string to JPEG bytes
/// 
/// # Arguments
/// * `svg_data` - The SVG string to render
/// * `scale` - Scale factor
/// * `quality` - JPEG quality (0-100)
/// * `font_db` - Font database for text rendering
/// 
/// # Returns
/// JPEG encoded bytes
#[allow(dead_code)]
pub fn svg_to_jpeg(
    svg_data: &str, 
    scale: f32, 
    quality: u8,
    font_db: &FontDatabase
) -> Result<Vec<u8>> {
    let (pixmap, width, height) = render_svg(svg_data, scale, font_db)?;
    let rgb_data = pixmap_to_rgb(&pixmap);
    
    let mut jpeg_bytes = Vec::new();
    Encoder::new(&mut jpeg_bytes, quality)
        .encode(&rgb_data, width as u16, height as u16, ColorType::Rgb)
        .context("Failed to encode JPEG")?;

    Ok(jpeg_bytes)
}

pub fn svg_to_rgb(svg_data: &str, scale: f32, font_db: &FontDatabase) -> Result<RenderedImage> {
    let (pixmap, width, height) = render_svg(svg_data, scale, font_db)?;
    Ok(RenderedImage {
        bytes: Vec::new(),
        rgb_bytes: pixmap_to_rgb(&pixmap),
        width,
        height,
    })
}

/// Render SVG with specific DPI setting
/// 
/// # Arguments
/// * `svg_data` - The SVG string to render
/// * `dpi` - Dots per inch (standard is 96)
/// * `font_db` - Font database
/// 
/// # Returns
/// PNG encoded bytes at specified DPI
#[allow(dead_code)]
pub fn svg_to_png_with_dpi(svg_data: &str, dpi: f32, font_db: &FontDatabase) -> Result<Vec<u8>> {
    // DPI scaling: 96 DPI is default in SVG
    let scale = dpi / 96.0;
    Ok(svg_to_png(svg_data, scale, font_db)?.bytes)
}

/// Get the size of an SVG in pixels at a specific DPI
#[allow(dead_code)]
pub fn get_svg_size(svg_data: &str, font_db: &FontDatabase) -> Result<(u32, u32)> {
    let options = Options {
        fontdb: Arc::clone(&font_db.db),
        ..Options::default()
    };
    
    let tree = Tree::from_str(svg_data, &options)
        .context("Failed to parse SVG")?;
    
    let size = tree.size();
    Ok((size.width() as u32, size.height() as u32))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::font_loader::FontDatabase;
    
    #[test]
    fn test_svg_to_png_simple() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
            <rect width="100" height="100" fill="red"/>
        </svg>"#;
        
        let font_db = FontDatabase::new();
        let result = svg_to_png(svg, 1.0, &font_db);
        assert!(result.is_ok());
        
        let png = result.unwrap().bytes;
        assert!(!png.is_empty());
        // PNG magic bytes
        assert_eq!(&png[0..4], &[0x89, 0x50, 0x4E, 0x47]);
    }
    
    #[test]
    fn test_get_svg_size() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
        </svg>"#;
        
        let font_db = FontDatabase::new();
        let size = get_svg_size(svg, &font_db).unwrap();
        assert_eq!(size, (1920, 1080));
    }
}
