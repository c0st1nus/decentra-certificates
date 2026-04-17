import type { TemplateLayoutData } from "@/lib/admin-api";

export type TemplatePreviewTextMetrics = {
  textLeft: number;
  textTop: number;
  baselineTop: number;
  textWidth: number;
  fontSize: number;
  fontFamily: string;
  ascentRatio: number;
  pdfFontFamily: string;
  source: "local" | "backend";
};

export type TemplatePdfPreviewDiagnostics = {
  preview_name: string;
  page_width: number;
  page_height: number;
  box_left: number;
  box_top: number;
  box_width: number;
  box_height: number;
  text_left: number;
  text_top: number;
  text_left_in_box: number;
  text_top_in_box: number;
  text_width: number;
  font_size: number;
  ascent_ratio: number;
  baseline_top: number;
  baseline_y: number;
  pdf_font_family: string;
  text_align: string;
  vertical_align: string;
};

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

const NAME_BOX_INSET = 16;

export function getTemplateNameBoxHeight(layout: TemplateLayoutData) {
  return Math.max(40, toInt(layout.name_box_height, DEFAULT_TEMPLATE_LAYOUT.name_box_height));
}

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

export function computeTemplatePreviewMetrics(
  layout: TemplateLayoutData,
  text: string,
): TemplatePreviewTextMetrics {
  const pdfFontFamily = resolvePdfFontFamily(layout.font_family);
  const previewFontFamily = resolvePreviewFontFamily(pdfFontFamily);
  const pdfFontSize = computePreviewFontSize(layout, text);
  const boxWidth = Math.min(layout.page_width, Math.max(240, layout.name_max_width));
  const boxHeight = getTemplateNameBoxHeight(layout);
  const textWidth = roundToHundredths(estimateTextWidth(text, pdfFontSize, pdfFontFamily));
  const ascentRatio = resolvePdfTextAscentRatio(pdfFontFamily);
  const textTop = roundToHundredths(
    computePreviewTextTop(layout, boxHeight, pdfFontSize, ascentRatio),
  );

  return {
    textLeft: roundToHundredths(resolvePreviewTextLeft(layout.text_align, boxWidth, textWidth)),
    textTop,
    baselineTop: roundToHundredths(textTop + ascentRatio * pdfFontSize),
    textWidth,
    fontSize: roundToHundredths(pdfFontSize),
    fontFamily: previewFontFamily,
    ascentRatio,
    pdfFontFamily,
    source: "local",
  };
}

export function buildTemplateSourceOverlayMetrics(
  layout: TemplateLayoutData,
  text: string,
  diagnostics: TemplatePdfPreviewDiagnostics | null,
) {
  const localMetrics = computeTemplatePreviewMetrics(layout, text);
  if (!diagnostics || !diagnosticsMatchLayout(diagnostics, layout, text)) {
    return localMetrics;
  }

  return {
    textLeft: roundToHundredths(diagnostics.text_left_in_box),
    textTop: roundToHundredths(diagnostics.text_top_in_box),
    baselineTop: roundToHundredths(diagnostics.baseline_top - diagnostics.box_top),
    textWidth: roundToHundredths(diagnostics.text_width),
    fontSize: roundToHundredths(diagnostics.font_size),
    fontFamily: resolvePreviewFontFamily(diagnostics.pdf_font_family),
    ascentRatio: diagnostics.ascent_ratio,
    pdfFontFamily: diagnostics.pdf_font_family,
    source: "backend" as const,
  };
}

function diagnosticsMatchLayout(
  diagnostics: TemplatePdfPreviewDiagnostics,
  layout: TemplateLayoutData,
  previewName: string,
) {
  const boxHeight = getTemplateNameBoxHeight(layout);
  const boxTop = Math.max(0, layout.name_y - boxHeight);

  return (
    roundToHundredths(diagnostics.page_width) === roundToHundredths(layout.page_width) &&
    roundToHundredths(diagnostics.page_height) === roundToHundredths(layout.page_height) &&
    roundToHundredths(diagnostics.box_left) === roundToHundredths(layout.name_x) &&
    roundToHundredths(diagnostics.box_top) === roundToHundredths(boxTop) &&
    roundToHundredths(diagnostics.box_width) === roundToHundredths(layout.name_max_width) &&
    roundToHundredths(diagnostics.box_height) === roundToHundredths(boxHeight) &&
    diagnostics.text_align === layout.text_align &&
    diagnostics.vertical_align === layout.vertical_align &&
    diagnostics.preview_name === previewName.trim()
  );
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

function computePreviewFontSize(layout: TemplateLayoutData, text: string) {
  let size = Math.max(1, layout.font_size);
  if (!layout.auto_shrink) {
    return size;
  }

  const widthLimit = Math.max(
    1,
    Math.min(layout.name_max_width - NAME_BOX_INSET * 2, layout.page_width - 96),
  );
  const estimated = estimateTextWidth(text, size, resolvePdfFontFamily(layout.font_family));
  if (estimated > widthLimit) {
    const ratio = widthLimit / estimated;
    size = Math.min(Math.max(size * ratio, 1), layout.font_size);
  }

  return size;
}

function computePreviewTextTop(
  layout: TemplateLayoutData,
  boxHeight: number,
  fontSize: number,
  ascentRatio: number,
) {
  switch (layout.vertical_align) {
    case "top":
      return NAME_BOX_INSET;
    case "bottom":
      return boxHeight - fontSize - NAME_BOX_INSET;
    default:
      return boxHeight / 2 + fontSize * (0.35 - ascentRatio);
  }
}

function resolvePreviewTextLeft(textAlign: string, boxWidth: number, textWidth: number) {
  switch (textAlign) {
    case "center":
      return boxWidth / 2 - textWidth / 2;
    case "right":
      return boxWidth - textWidth - NAME_BOX_INSET;
    default:
      return NAME_BOX_INSET;
  }
}

function estimateTextWidth(text: string, fontSize: number, fontFamily: string) {
  return estimateTextUnits(text, fontFamily) * fontSize;
}

function roundToHundredths(value: number) {
  return Math.round(value * 100) / 100;
}

function estimateTextUnits(text: string, fontFamily: string) {
  const normalized = fontFamily.toLowerCase();
  const familyFactor =
    normalized === "times-roman"
      ? 0.85
      : normalized === "courier"
        ? 0.62
        : normalized === "symbol" || normalized === "zapfdingbats"
          ? 0.7
          : 1;

  let units = 0;
  for (const char of text.trim()) {
    units += estimateCharUnit(char);
  }

  return Math.max(1, units * familyFactor);
}

function estimateCharUnit(char: string) {
  if (char === " ") {
    return 0.33;
  }

  if ("ilI|!'`.,".includes(char)) {
    return 0.3;
  }

  if ("fjrt()[]{}:;".includes(char)) {
    return 0.4;
  }

  if ("mwMW@%&".includes(char)) {
    return 0.92;
  }

  if (/[A-Z]/.test(char)) {
    return 0.72;
  }

  if (/[0-9]/.test(char)) {
    return 0.62;
  }

  return 0.56;
}

function resolvePdfFontFamily(fontFamily: string) {
  const normalized = fontFamily.trim().toLowerCase();

  switch (normalized) {
    case "outfit":
    case "arial":
    case "helvetica":
    case "helvetica neue":
    case "verdana":
    case "trebuchet ms":
    case "impact":
    case "arial black":
      return "Helvetica";
    case "times new roman":
    case "times":
    case "georgia":
      return "Times-Roman";
    case "courier new":
    case "courier":
      return "Courier";
    case "symbol":
      return "Symbol";
    case "zapf dingbats":
      return "ZapfDingbats";
    default:
      return "Helvetica";
  }
}

function resolvePreviewFontFamily(fontFamily: string) {
  const normalized = fontFamily.trim().toLowerCase();

  switch (normalized) {
    case "helvetica":
    case "helvetica-bold":
    case "outfit":
    case "arial":
    case "helvetica neue":
    case "verdana":
    case "trebuchet ms":
    case "impact":
    case "arial black":
      return '"Arial", "Helvetica Neue", Helvetica, sans-serif';
    case "times-roman":
    case "times new roman":
    case "times":
    case "georgia":
      return '"Times New Roman", Times, Georgia, serif';
    case "courier":
    case "courier new":
      return '"Courier New", Courier, monospace';
    case "symbol":
      return "Symbol, sans-serif";
    case "zapf dingbats":
      return '"Zapf Dingbats", "Apple Symbols", sans-serif';
    default:
      return '"Arial", "Helvetica Neue", Helvetica, sans-serif';
  }
}

function resolvePdfTextAscentRatio(fontFamily: string) {
  switch (fontFamily.trim().toLowerCase()) {
    case "times-roman":
      return 0.7;
    case "courier":
      return 0.76;
    case "symbol":
      return 0.73;
    case "zapfdingbats":
      return 0.76;
    default:
      return 0.78;
  }
}
