use std::collections::HashMap;

use crate::services::templates::{TemplateCanvasData, TemplateCanvasLayer, TemplateCanvasText};

/// Generates an SVG string from canvas layers and template data
pub fn generate_svg(
    page_width: i32,
    page_height: i32,
    background_src: Option<&str>,
    canvas: &TemplateCanvasData,
    binding_values: &HashMap<String, String>,
) -> String {
    let mut svg_parts = vec![];

    // SVG header with viewBox
    svg_parts.push(format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {width} {height}" width="{width}" height="{height}">"#,
        width = page_width,
        height = page_height
    ));

    // Background rectangle (white by default)
    svg_parts.push(r#"<rect width="100%" height="100%" fill="white"/>"#.to_string());

    // Background image if provided
    if let Some(bg) = background_src {
        svg_parts.push(format!(
            r#"<image xlink:href="{src}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/>"#,
            src = escape_xml(bg)
        ));
    }

    // Process each layer
    for layer in &canvas.layers {
        let layer_svg = render_layer(layer, binding_values);
        svg_parts.push(layer_svg);
    }

    // Close SVG
    svg_parts.push("</svg>".to_string());

    svg_parts.join("\n")
}

fn render_layer(layer: &TemplateCanvasLayer, binding_values: &HashMap<String, String>) -> String {
    // Rotation and opacity were removed from the editor UI.
    // Ignore stale persisted values so backend preview matches the live canvas.
    let transform = String::new();
    let opacity_attr = String::new();

    match layer.kind.as_str() {
        "text" => render_text_layer(layer, binding_values, &transform, &opacity_attr),
        "image" => render_image_layer(layer, &transform, &opacity_attr),
        _ => String::new(),
    }
}

fn render_text_layer(
    layer: &TemplateCanvasLayer,
    binding_values: &HashMap<String, String>,
    transform: &str,
    opacity_attr: &str,
) -> String {
    let text_data = match &layer.text {
        Some(t) => t,
        None => return String::new(),
    };

    // Resolve binding values
    let text_content = resolve_text_content(text_data, binding_values);

    // Convert hex color to RGB
    let color = parse_hex_color(&text_data.font_color_hex);

    // Text alignment
    let text_anchor = match text_data.text_align.as_str() {
        "left" => "start",
        "center" => "middle",
        "right" => "end",
        _ => "start",
    };

    // Calculate text position
    let x = match text_data.text_align.as_str() {
        "left" => layer.x,
        "center" => layer.x + layer.width / 2,
        "right" => layer.x + layer.width,
        _ => layer.x,
    };

    // Avoid SVG baseline modes here: resvg/usvg can render `ideographic` inconsistently,
    // which causes bottom-aligned text to appear offset or sideways. We keep a normal
    // horizontal text run and compute the baseline position manually.
    let baseline_padding = ((text_data.font_size as f32) * 0.2).round() as i32;
    let y = match text_data.vertical_align.as_str() {
        "top" => layer.y + text_data.font_size,
        "center" => layer.y + layer.height / 2 + text_data.font_size / 3,
        "bottom" => layer.y + layer.height - baseline_padding,
        _ => layer.y + text_data.font_size,
    };

    // Background color if specified
    let bg_rect = if let Some(bg_color) = &text_data.background_color_hex {
        let bg_rgb = parse_hex_color(bg_color);
        format!(
            r#"<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="rgb({r},{g},{b})" {transform}{opacity}/>"#,
            x = layer.x,
            y = layer.y,
            width = layer.width,
            height = layer.height,
            r = bg_rgb.0,
            g = bg_rgb.1,
            b = bg_rgb.2,
            transform = transform,
            opacity = opacity_attr,
        )
    } else {
        String::new()
    };

    // Main text element
    format!(
        r#"{bg_rect}<text x="{x}" y="{y}" font-family="{font_family}" font-size="{font_size}" font-weight="{font_weight}" fill="rgb({r},{g},{b})" text-anchor="{text_anchor}" letter-spacing="{letter_spacing}" xml:space="preserve" {transform}{opacity}>{text}</text>"#,
        bg_rect = bg_rect,
        x = x,
        y = y,
        font_family = escape_xml(&font_family_stack(&text_data.font_family)),
        font_size = text_data.font_size,
        font_weight = text_data.font_weight,
        r = color.0,
        g = color.1,
        b = color.2,
        text_anchor = text_anchor,
        letter_spacing = text_data.letter_spacing,
        transform = transform,
        opacity = opacity_attr,
        text = escape_xml(&text_content),
    )
}

fn render_image_layer(layer: &TemplateCanvasLayer, transform: &str, opacity_attr: &str) -> String {
    let image_data = match &layer.image {
        Some(i) => i,
        None => return String::new(),
    };

    let preserve_aspect = match image_data.fit.as_str() {
        "contain" => r#"preserveAspectRatio="xMidYMid meet""#,
        "cover" => r#"preserveAspectRatio="xMidYMid slice""#,
        _ => r#"preserveAspectRatio="none""#,
    };

    format!(
        r#"<image xlink:href="{src}" x="{x}" y="{y}" width="{width}" height="{height}" {preserve_aspect} {transform}{opacity}/>"#,
        src = escape_xml(&image_data.src),
        x = layer.x,
        y = layer.y,
        width = layer.width,
        height = layer.height,
        preserve_aspect = preserve_aspect,
        transform = transform,
        opacity = opacity_attr,
    )
}

fn resolve_text_content(
    text: &TemplateCanvasText,
    binding_values: &HashMap<String, String>,
) -> String {
    let mut result = text.content.clone();
    let mut replaced_placeholder = false;
    for (key, value) in binding_values {
        let placeholder = format!("{{{{{}}}}}", key);
        if result.contains(&placeholder) {
            replaced_placeholder = true;
            result = result.replace(&placeholder, value);
        }
    }

    let trimmed = result.trim();
    if !trimmed.is_empty() && replaced_placeholder {
        return result;
    }

    if let Some(binding) = text
        .binding
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        && let Some(value) = binding_values.get(binding)
    {
        return value.clone();
    }

    if !trimmed.is_empty() && !trimmed.contains("{{") {
        return result;
    }

    result
}

fn font_family_stack(font_family: &str) -> String {
    match font_family.trim().to_ascii_lowercase().as_str() {
        "outfit" | "inter" | "roboto" | "open sans" | "lato" | "montserrat" | "poppins"
        | "nunito" | "oswald" | "raleway" => format!(
            "{}, Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif",
            font_family.trim()
        ),
        "playfair display" | "merriweather" | "times new roman" | "times" | "georgia" => {
            format!(
                "{}, Liberation Serif, DejaVu Serif, Times New Roman, Times, serif",
                font_family.trim()
            )
        }
        "courier new" | "courier" => format!(
            "{}, Liberation Mono, DejaVu Sans Mono, Courier New, Courier, monospace",
            font_family.trim()
        ),
        other => format!(
            "{}, Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif",
            other
        ),
    }
}

fn parse_hex_color(hex: &str) -> (u8, u8, u8) {
    let hex = hex.trim_start_matches('#');
    match hex.len() {
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
            (r, g, b)
        }
        3 => {
            let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).unwrap_or(0);
            (r, g, b)
        }
        _ => (0, 0, 0),
    }
}

fn escape_xml(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_color() {
        assert_eq!(parse_hex_color("#FF5733"), (255, 87, 51));
        assert_eq!(parse_hex_color("#fff"), (255, 255, 255));
        assert_eq!(parse_hex_color("FF5733"), (255, 87, 51));
    }

    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("<test>"), "&lt;test&gt;");
        assert_eq!(escape_xml("\"quote\""), "&quot;quote&quot;");
    }

    #[test]
    fn test_resolve_text_content() {
        let mut bindings = HashMap::new();
        bindings.insert("participant.full_name".to_string(), "John Doe".to_string());

        let text = TemplateCanvasText {
            content: "Hello {{participant.full_name}}".to_string(),
            binding: Some("participant.full_name".to_string()),
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
        };

        assert_eq!(resolve_text_content(&text, &bindings), "Hello John Doe");
    }
}
