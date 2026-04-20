import type {
  TemplateCanvasData,
  TemplateCanvasImageLayer,
  TemplateCanvasLayer,
  TemplateCanvasTextLayer,
  TemplateLayoutData,
} from "@/lib/admin-api";
import { sanitizeTemplateLayout } from "@/lib/template-layout";

const LEGACY_NAME_LAYER_ID = "legacy-name-layer";
const LEGACY_NAME_ROLE = "legacy_name";

type SanitizeTemplateCanvasOptions = {
  preserveLegacyFromCanvas?: boolean;
  forceLegacyLayer?: boolean;
};

export function sanitizeTemplateCanvas(
  layout?: TemplateLayoutData | null,
  options?: SanitizeTemplateCanvasOptions,
): TemplateCanvasData {
  const safeLayout = sanitizeTemplateLayout(layout);
  const existingLayers = layout?.canvas?.layers ?? [];
  const hasExplicitCanvas = Array.isArray(layout?.canvas?.layers);
  const normalizedLayers = existingLayers
    .map((layer) => sanitizeCanvasLayer(layer))
    .filter(Boolean) as TemplateCanvasLayer[];

  const legacyLayer = normalizedLayers.find((layer) => layer.role === LEGACY_NAME_ROLE);
  const nextLayers = legacyLayer
    ? normalizedLayers.map((layer) =>
        layer.role === LEGACY_NAME_ROLE
          ? buildLegacyNameLayer(safeLayout, layer, {
              preserveCanvasState: options?.preserveLegacyFromCanvas === true,
            })
          : layer,
      )
    : hasExplicitCanvas && options?.forceLegacyLayer !== true
      ? normalizedLayers
      : [buildLegacyNameLayer(safeLayout), ...normalizedLayers];

  return {
    version: layout?.canvas?.version ?? 1,
    layers: sortLayers(nextLayers),
  };
}

export function syncLayoutWithCanvas(
  layout: TemplateLayoutData,
  canvas: TemplateCanvasData,
): TemplateLayoutData {
  const safeLayout = sanitizeTemplateLayout(layout);
  const normalizedCanvas = sanitizeTemplateCanvas(
    {
      ...safeLayout,
      canvas,
    },
    {
      preserveLegacyFromCanvas: true,
    },
  );
  const legacyLayer =
    normalizedCanvas.layers.find((layer) => layer.role === LEGACY_NAME_ROLE) ??
    buildLegacyNameLayer(safeLayout);
  const text = legacyLayer.text ?? buildDefaultTextLayer(safeLayout);

  return sanitizeTemplateLayout({
    ...safeLayout,
    name_x: legacyLayer.x,
    name_y: legacyLayer.y + legacyLayer.height,
    name_max_width: legacyLayer.width,
    name_box_height: legacyLayer.height,
    font_family: text.font_family,
    font_size: text.font_size,
    font_color_hex: text.font_color_hex,
    text_align: text.text_align,
    vertical_align: text.vertical_align,
    auto_shrink: text.auto_shrink,
    canvas: normalizedCanvas,
  });
}

export function createTextCanvasLayer(layout: TemplateLayoutData): TemplateCanvasLayer {
  return {
    id: createCanvasLayerId(),
    name: "Text block",
    kind: "text",
    role: null,
    x: Math.round(layout.page_width * 0.18),
    y: Math.round(layout.page_height * 0.22),
    width: Math.round(layout.page_width * 0.34),
    height: 120,
    rotation: 0,
    opacity: 100,
    visible: true,
    locked: false,
    text: {
      content: "Certificate body copy",
      binding: null,
      font_family: layout.font_family,
      font_size: 34,
      font_color_hex: layout.font_color_hex,
      text_align: "left",
      vertical_align: "top",
      auto_shrink: false,
      font_weight: 500,
      letter_spacing: 0,
      line_height: 130,
      background_color_hex: null,
    },
    image: null,
  };
}

export function createImageCanvasLayer(
  layout: TemplateLayoutData,
  src: string,
  fileName?: string,
  imageSize?: { width: number; height: number },
): TemplateCanvasLayer {
  const fittedSize = imageSize
    ? getFittedImageLayerSize(layout, imageSize.width, imageSize.height)
    : {
        width: Math.round(layout.page_width * 0.18),
        height: Math.round(layout.page_height * 0.18),
      };

  return {
    id: createCanvasLayerId(),
    name: fileName?.replace(/\.[^.]+$/, "") || "Image asset",
    kind: "image",
    role: null,
    x: Math.max(
      0,
      Math.min(Math.round(layout.page_width * 0.62), layout.page_width - fittedSize.width),
    ),
    y: Math.max(
      0,
      Math.min(Math.round(layout.page_height * 0.18), layout.page_height - fittedSize.height),
    ),
    width: fittedSize.width,
    height: fittedSize.height,
    rotation: 0,
    opacity: 100,
    visible: true,
    locked: false,
    text: null,
    image: {
      src,
      fit: "contain",
      border_radius: 16,
    },
  };
}

export function getFittedImageLayerSize(
  layout: TemplateLayoutData,
  naturalWidth: number,
  naturalHeight: number,
) {
  const safeWidth = Math.max(1, naturalWidth);
  const safeHeight = Math.max(1, naturalHeight);
  const maxWidth = Math.round(layout.page_width * 0.24);
  const maxHeight = Math.round(layout.page_height * 0.24);
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);

  return {
    width: Math.max(60, Math.round(safeWidth * scale)),
    height: Math.max(60, Math.round(safeHeight * scale)),
  };
}

export function updateCanvasLayers(
  canvas: TemplateCanvasData,
  updater: (layers: TemplateCanvasLayer[]) => TemplateCanvasLayer[],
): TemplateCanvasData {
  return {
    ...canvas,
    layers: sortLayers(
      updater(canvas.layers)
        .map((layer) => sanitizeCanvasLayer(layer))
        .filter(Boolean) as TemplateCanvasLayer[],
    ),
  };
}

export function getCanvasLayerLabel(layer: TemplateCanvasLayer) {
  if (layer.role === LEGACY_NAME_ROLE) {
    return "Participant name";
  }

  return layer.name;
}

export function getCanvasLayerDisplayText(
  layer: TemplateCanvasLayer,
  previewName: string,
  bindingValues: Record<string, string> = {},
) {
  if (layer.kind !== "text" || !layer.text) {
    return "";
  }

  return resolveCanvasLayerText(layer.text, previewName, bindingValues);
}

export function resolveCanvasLayerText(
  text: TemplateCanvasTextLayer,
  previewName: string,
  bindingValues: Record<string, string>,
) {
  const content = text.content ?? "";
  const resolvedValues: Record<string, string> = {
    ...bindingValues,
    "participant.full_name": bindingValues["participant.full_name"] ?? previewName.trim(),
    full_name: bindingValues.full_name ?? previewName.trim(),
    name: bindingValues.name ?? previewName.trim(),
  };

  const rendered = replaceTemplatePlaceholders(content, resolvedValues).trim();
  if (rendered) {
    return rendered;
  }

  if (text.binding) {
    return (
      resolvedValues[text.binding] ??
      resolvedValues[text.binding.trim()] ??
      previewName.trim() ??
      text.content
    );
  }

  return content;
}

export function clampLayerToLayout(
  layer: TemplateCanvasLayer,
  layout: TemplateLayoutData,
): TemplateCanvasLayer {
  const minWidth = layer.kind === "image" ? 60 : 140;
  const minHeight = layer.kind === "image" ? 60 : 48;
  const width = clamp(Math.round(layer.width), minWidth, layout.page_width);
  const height = clamp(Math.round(layer.height), minHeight, layout.page_height);

  return {
    ...layer,
    x: clamp(Math.round(layer.x), 0, Math.max(0, layout.page_width - width)),
    y: clamp(Math.round(layer.y), 0, Math.max(0, layout.page_height - height)),
    width,
    height,
    opacity: 100,
    rotation: 0,
    visible: true,
    locked: false,
  };
}

function sanitizeCanvasLayer(layer?: TemplateCanvasLayer | null) {
  if (!layer?.id || !layer.kind) {
    return null;
  }

  if (layer.kind === "text") {
    return {
      ...layer,
      name: layer.name || "Text block",
      role: layer.role ?? null,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      text: sanitizeTextLayer(layer.text),
      image: null,
    } satisfies TemplateCanvasLayer;
  }

  if (layer.kind === "image") {
    return {
      ...layer,
      name: layer.name || "Image asset",
      role: layer.role ?? null,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      text: null,
      image: sanitizeImageLayer(layer.image),
    } satisfies TemplateCanvasLayer;
  }

  return null;
}

function sanitizeTextLayer(layer?: TemplateCanvasTextLayer | null): TemplateCanvasTextLayer {
  return {
    content: layer?.content || "Text block",
    binding: null,
    font_family: layer?.font_family || "Outfit",
    font_size: clamp(Math.round(layer?.font_size ?? 32), 1, 400),
    font_color_hex: normalizeHexColor(layer?.font_color_hex || "#111827"),
    text_align:
      layer?.text_align === "left" ||
      layer?.text_align === "center" ||
      layer?.text_align === "right"
        ? layer.text_align
        : "left",
    vertical_align:
      layer?.vertical_align === "top" ||
      layer?.vertical_align === "center" ||
      layer?.vertical_align === "bottom"
        ? layer.vertical_align
        : "top",
    auto_shrink: layer?.auto_shrink === true,
    font_weight: clamp(Math.round(layer?.font_weight ?? 500), 1, 1000),
    letter_spacing: Math.round(layer?.letter_spacing ?? 0),
    line_height: clamp(Math.round(layer?.line_height ?? 130), 1, 400),
    background_color_hex: layer?.background_color_hex
      ? normalizeHexColor(layer.background_color_hex)
      : null,
  };
}

function sanitizeImageLayer(layer?: TemplateCanvasImageLayer | null): TemplateCanvasImageLayer {
  return {
    src: layer?.src || "",
    fit:
      layer?.fit === "cover" || layer?.fit === "contain" || layer?.fit === "fill"
        ? layer.fit
        : "fill",
    border_radius: clamp(Math.round(layer?.border_radius ?? 16), 0, 48),
  };
}

function buildLegacyNameLayer(
  layout: TemplateLayoutData,
  current?: TemplateCanvasLayer,
  options?: {
    preserveCanvasState?: boolean;
  },
): TemplateCanvasLayer {
  const text = current?.text ? sanitizeTextLayer(current.text) : buildDefaultTextLayer(layout);
  const preserveCanvasState = options?.preserveCanvasState === true;
  const nextLayer: TemplateCanvasLayer = {
    id: current?.id || LEGACY_NAME_LAYER_ID,
    name: "Participant name",
    kind: "text",
    role: LEGACY_NAME_ROLE,
    x: preserveCanvasState ? (current?.x ?? layout.name_x) : layout.name_x,
    y: preserveCanvasState
      ? (current?.y ?? layout.name_y - layout.name_box_height)
      : layout.name_y - layout.name_box_height,
    width: preserveCanvasState ? (current?.width ?? layout.name_max_width) : layout.name_max_width,
    height: preserveCanvasState
      ? (current?.height ?? layout.name_box_height)
      : layout.name_box_height,
    rotation: 0,
    opacity: current?.opacity ?? 100,
    visible: current?.visible !== false,
    locked: false,
    text: {
      ...text,
      binding: "participant.full_name",
      font_family: preserveCanvasState ? text.font_family : layout.font_family,
      font_size: preserveCanvasState ? text.font_size : layout.font_size,
      font_color_hex: preserveCanvasState ? text.font_color_hex : layout.font_color_hex,
      text_align: preserveCanvasState ? text.text_align : layout.text_align,
      vertical_align: preserveCanvasState ? text.vertical_align : layout.vertical_align,
      auto_shrink: preserveCanvasState ? text.auto_shrink : layout.auto_shrink,
    },
    image: null,
  };

  return clampLayerToLayout(nextLayer, layout);
}

function buildDefaultTextLayer(layout: TemplateLayoutData): TemplateCanvasTextLayer {
  return {
    content: "Preview Participant",
    binding: "participant.full_name",
    font_family: layout.font_family,
    font_size: layout.font_size,
    font_color_hex: layout.font_color_hex,
    text_align: layout.text_align,
    vertical_align: layout.vertical_align,
    auto_shrink: layout.auto_shrink,
    font_weight: 500,
    letter_spacing: 0,
    line_height: 120,
    background_color_hex: null,
  };
}

function sortLayers(layers: TemplateCanvasLayer[]) {
  return [...layers];
}

function createCanvasLayerId() {
  return `layer-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return "#111827";
  }

  return `#${trimmed.slice(1).toUpperCase()}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function replaceTemplatePlaceholders(text: string, bindingValues: Record<string, string>) {
  return text.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
    const value = bindingValues[key] ?? bindingValues[key.trim()];
    return typeof value === "string" ? value : match;
  });
}
