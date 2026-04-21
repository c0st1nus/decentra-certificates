use anyhow::{Context, Result};

use crate::services::font_loader::FontDatabase;

pub fn svg_to_vector_pdf(svg: &str, font_db: &FontDatabase) -> Result<Vec<u8>> {
    let mut options = svg2pdf::usvg::Options::default();
    options.fontdb = (*font_db.db).clone().into();

    let tree =
        svg2pdf::usvg::Tree::from_str(svg, &options).context("Failed to parse SVG for PDF")?;
    svg2pdf::to_pdf(
        &tree,
        svg2pdf::ConversionOptions::default(),
        svg2pdf::PageOptions::default(),
    )
    .map_err(|err| anyhow::anyhow!("Failed to convert SVG to vector PDF: {err}"))
}
