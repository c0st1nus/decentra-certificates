import type { TemplateLayoutData } from "@/lib/admin-api";

export const DEFAULT_TEMPLATE_LAYOUT: TemplateLayoutData = {
  page_width: 1920,
  page_height: 1080,
  name_x: 420,
  name_y: 520,
  name_max_width: 1080,
  name_box_height: 81,
  font_family: "Outfit",
  font_size: 54,
  font_color_hex: "#111827",
  text_align: "center",
  vertical_align: "center",
  auto_shrink: true,
};

export function sanitizeTemplateLayout(
  layout?: Partial<TemplateLayoutData> | null,
): TemplateLayoutData {
  const source = layout ?? DEFAULT_TEMPLATE_LAYOUT;
  const pageWidth = toInt(source.page_width, DEFAULT_TEMPLATE_LAYOUT.page_width);
  const pageHeight = toInt(source.page_height, DEFAULT_TEMPLATE_LAYOUT.page_height);
  const boxHeight = Math.max(
    40,
    toInt(source.name_box_height, DEFAULT_TEMPLATE_LAYOUT.name_box_height),
  );
  const nameX = clamp(
    toInt(source.name_x, DEFAULT_TEMPLATE_LAYOUT.name_x),
    0,
    Math.max(0, pageWidth - 240),
  );
  const nameWidth = clamp(
    toInt(source.name_max_width, DEFAULT_TEMPLATE_LAYOUT.name_max_width),
    240,
    Math.max(240, pageWidth - nameX),
  );
  const nameY = clamp(toInt(source.name_y, DEFAULT_TEMPLATE_LAYOUT.name_y), boxHeight, pageHeight);

  return {
    page_width: pageWidth,
    page_height: pageHeight,
    name_x: nameX,
    name_y: nameY,
    name_max_width: nameWidth,
    name_box_height: boxHeight,
    font_family:
      typeof source.font_family === "string" && source.font_family.trim()
        ? source.font_family
        : DEFAULT_TEMPLATE_LAYOUT.font_family,
    font_size: clamp(toInt(source.font_size, DEFAULT_TEMPLATE_LAYOUT.font_size), 16, 120),
    font_color_hex:
      typeof source.font_color_hex === "string" && source.font_color_hex.trim()
        ? normalizeHexColor(source.font_color_hex)
        : DEFAULT_TEMPLATE_LAYOUT.font_color_hex,
    text_align:
      source.text_align === "left" ||
      source.text_align === "center" ||
      source.text_align === "right"
        ? source.text_align
        : DEFAULT_TEMPLATE_LAYOUT.text_align,
    vertical_align:
      source.vertical_align === "top" ||
      source.vertical_align === "center" ||
      source.vertical_align === "bottom"
        ? source.vertical_align
        : DEFAULT_TEMPLATE_LAYOUT.vertical_align,
    auto_shrink:
      typeof source.auto_shrink === "boolean"
        ? source.auto_shrink
        : DEFAULT_TEMPLATE_LAYOUT.auto_shrink,
    canvas: source.canvas ?? null,
  };
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return "#111827";
  }

  return `#${trimmed.slice(1).toUpperCase()}`;
}

function toInt(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
