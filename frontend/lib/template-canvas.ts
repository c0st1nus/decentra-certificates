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

export function sanitizeTemplateCanvas(layout?: TemplateLayoutData | null): TemplateCanvasData {
  const safeLayout = sanitizeTemplateLayout(layout);
  const existingLayers = layout?.canvas?.layers ?? [];
  const normalizedLayers = existingLayers
    .map((layer) => sanitizeCanvasLayer(layer))
    .filter(Boolean) as TemplateCanvasLayer[];

  const legacyLayer = normalizedLayers.find((layer) => layer.role === LEGACY_NAME_ROLE);
  const nextLayers = legacyLayer
    ? normalizedLayers.map((layer) =>
        layer.role === LEGACY_NAME_ROLE ? buildLegacyNameLayer(safeLayout, layer) : layer,
      )
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
  const normalizedCanvas = sanitizeTemplateCanvas({
    ...safeLayout,
    canvas,
  });
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
): TemplateCanvasLayer {
  return {
    id: createCanvasLayerId(),
    name: fileName?.replace(/\.[^.]+$/, "") || "Image asset",
    kind: "image",
    role: null,
    x: Math.round(layout.page_width * 0.62),
    y: Math.round(layout.page_height * 0.18),
    width: Math.round(layout.page_width * 0.18),
    height: Math.round(layout.page_height * 0.18),
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

export function moveLayerForward(canvas: TemplateCanvasData, layerId: string): TemplateCanvasData {
  const index = canvas.layers.findIndex((layer) => layer.id === layerId);
  if (index === -1 || index === canvas.layers.length - 1) {
    return canvas;
  }

  const next = [...canvas.layers];
  const [layer] = next.splice(index, 1);
  next.splice(index + 1, 0, layer);
  return { ...canvas, layers: next };
}

export function moveLayerBackward(canvas: TemplateCanvasData, layerId: string): TemplateCanvasData {
  const index = canvas.layers.findIndex((layer) => layer.id === layerId);
  if (index <= 0) {
    return canvas;
  }

  const next = [...canvas.layers];
  const [layer] = next.splice(index, 1);
  next.splice(index - 1, 0, layer);
  return { ...canvas, layers: next };
}

export function getCanvasLayerLabel(layer: TemplateCanvasLayer) {
  if (layer.role === LEGACY_NAME_ROLE) {
    return "Participant name";
  }

  return layer.name;
}

export function getCanvasLayerDisplayText(layer: TemplateCanvasLayer, previewName: string) {
  if (layer.kind !== "text" || !layer.text) {
    return "";
  }

  if (layer.text.binding === "participant.full_name") {
    return previewName.trim() || "Preview Participant";
  }

  return layer.text.content;
}

export function isLegacyNameLayer(layer: TemplateCanvasLayer) {
  return layer.role === LEGACY_NAME_ROLE;
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
    opacity: clamp(Math.round(layer.opacity), 0, 100),
    rotation: Math.round(layer.rotation),
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
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: clamp(Math.round(layer.opacity ?? 100), 0, 100),
      rotation: Math.round(layer.rotation ?? 0),
      text: sanitizeTextLayer(layer.text),
      image: null,
    } satisfies TemplateCanvasLayer;
  }

  if (layer.kind === "image") {
    return {
      ...layer,
      name: layer.name || "Image asset",
      role: layer.role ?? null,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: clamp(Math.round(layer.opacity ?? 100), 0, 100),
      rotation: Math.round(layer.rotation ?? 0),
      text: null,
      image: sanitizeImageLayer(layer.image),
    } satisfies TemplateCanvasLayer;
  }

  return null;
}

function sanitizeTextLayer(layer?: TemplateCanvasTextLayer | null): TemplateCanvasTextLayer {
  return {
    content: layer?.content || "Text block",
    binding: layer?.binding ?? null,
    font_family: layer?.font_family || "Outfit",
    font_size: clamp(Math.round(layer?.font_size ?? 32), 12, 160),
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
    font_weight: clamp(Math.round(layer?.font_weight ?? 500), 300, 900),
    letter_spacing: Math.round(layer?.letter_spacing ?? 0),
    line_height: clamp(Math.round(layer?.line_height ?? 130), 80, 220),
    background_color_hex: layer?.background_color_hex
      ? normalizeHexColor(layer.background_color_hex)
      : null,
  };
}

function sanitizeImageLayer(layer?: TemplateCanvasImageLayer | null): TemplateCanvasImageLayer {
  return {
    src: layer?.src || "",
    fit: layer?.fit === "cover" ? "cover" : "contain",
    border_radius: clamp(Math.round(layer?.border_radius ?? 16), 0, 48),
  };
}

function buildLegacyNameLayer(
  layout: TemplateLayoutData,
  current?: TemplateCanvasLayer,
): TemplateCanvasLayer {
  const text = current?.text ? sanitizeTextLayer(current.text) : buildDefaultTextLayer(layout);

  return {
    id: current?.id || LEGACY_NAME_LAYER_ID,
    name: "Participant name",
    kind: "text",
    role: LEGACY_NAME_ROLE,
    x: layout.name_x,
    y: layout.name_y - layout.name_box_height,
    width: layout.name_max_width,
    height: layout.name_box_height,
    rotation: 0,
    opacity: current?.opacity ?? 100,
    visible: current?.visible !== false,
    locked: false,
    text: {
      ...text,
      binding: "participant.full_name",
      font_family: layout.font_family,
      font_size: layout.font_size,
      font_color_hex: layout.font_color_hex,
      text_align: layout.text_align,
      vertical_align: layout.vertical_align,
      auto_shrink: layout.auto_shrink,
    },
    image: null,
  };
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
  const legacy = layers.filter((layer) => layer.role === LEGACY_NAME_ROLE);
  const others = layers.filter((layer) => layer.role !== LEGACY_NAME_ROLE);
  return [...legacy, ...others];
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
