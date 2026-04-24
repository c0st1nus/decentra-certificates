"use client";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  GripVertical,
  ImagePlus,
  LoaderCircle,
  Plus,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const FONT_PRELOAD_URLS = [
  "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap",
];

import {
  type TemplateCanvasData,
  type TemplateCanvasLayer,
  type TemplateCanvasTextLayer,
  type TemplateDetail,
  type TemplateLayoutData,
  fetchTemplateSource,
  previewTemplate,
  saveTemplateLayout,
} from "@/lib/admin-api";
import {
  clampLayerToLayout,
  createImageCanvasLayer,
  createTextCanvasLayer,
  getFittedImageLayerSize,
  resolveCanvasLayerText,
  sanitizeTemplateCanvas,
  syncLayoutWithCanvas,
  updateCanvasLayers,
} from "@/lib/template-canvas";
import { sanitizeTemplateLayout } from "@/lib/template-layout";
import { cn } from "@/lib/utils";

function buildPreviewBindingValues(
  previewName: string,
  template: TemplateDetail,
): Record<string, string> {
  const name = previewName.trim() || "Preview Participant";
  return {
    "participant.full_name": name,
    full_name: name,
    name,
    "participant.category": "Preview track",
    track_name: "Preview track",
    "template.name": template.template.name,
    certificate_type: template.template.name,
    "issue.certificate_id": "cert-preview-0001",
    certificate_id: "cert-preview-0001",
    "issue.issue_date": new Date().toISOString().slice(0, 10),
    "issue.verification_code": "verify-preview-0001",
  };
}

type TemplateLayoutEditorProps = {
  template: TemplateDetail;
  onSaved?: (layout: TemplateLayoutData) => void;
  showHeader?: boolean;
};

type ResizeMode =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type DragState = {
  layerId: string;
  offsetX: number;
  offsetY: number;
  pointerId: number;
};

type ResizeState = {
  layerId: string;
  mode: ResizeMode;
  pointerId: number;
  startX: number;
  startY: number;
  startLayer: TemplateCanvasLayer;
};

type PreviewState = "idle" | "loading" | "ready" | "error";

const SAFE_FONT_OPTIONS = [
  { label: "Outfit", value: "Outfit" },
  { label: "Inter", value: "Inter" },
  { label: "Arial", value: "Arial" },
  { label: "Helvetica", value: "Helvetica" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Georgia", value: "Georgia" },
  { label: "Courier New", value: "Courier New" },
];

const BINDING_OPTIONS = [
  { label: "Free text", value: "", sample: "Preview participant" },
  {
    label: "Participant full name",
    value: "participant.full_name",
    sample: "Preview participant",
  },
  {
    label: "Track / category",
    value: "participant.category",
    sample: "Main track",
  },
  {
    label: "Certificate type",
    value: "template.name",
    sample: "Hackathon Certificate",
  },
  { label: "Issue date", value: "issue.issue_date", sample: "2026-04-20" },
  {
    label: "Certificate ID",
    value: "issue.certificate_id",
    sample: "cert-preview-0001",
  },
];

export function TemplateLayoutEditor({
  template,
  onSaved,
  showHeader = true,
}: TemplateLayoutEditorProps) {
  const initialLayout = sanitizeTemplateLayout(template.layout);
  const initialCanvas = sanitizeTemplateCanvas(initialLayout);

  const [layout, setLayout] = useState<TemplateLayoutData>(initialLayout);
  const [canvas, setCanvas] = useState<TemplateCanvasData>(initialCanvas);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(initialCanvas.layers[0]?.id ?? "");
  const [previewName, setPreviewName] = useState("Preview Participant");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewMessage, setPreviewMessage] = useState(
    "Layers render instantly. Generate preview when you want to check the server output.",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const [isTextSettingsOpen, setIsTextSettingsOpen] = useState(false);
  const [imageTarget, setImageTarget] = useState<{
    mode: "add" | "replace";
    layerId?: string;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{
    vertical: number | null;
    horizontal: number | null;
  }>({
    vertical: null,
    horizontal: null,
  });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const previewRequestRef = useRef(0);
  const layoutRef = useRef(layout);
  const canvasRef = useRef(canvas);

  const selectedLayer = canvas.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedTextLayer =
    selectedLayer?.kind === "text" && selectedLayer.text ? selectedLayer.text : null;
  const selectedImageLayer =
    selectedLayer?.kind === "image" && selectedLayer.image ? selectedLayer.image : null;

  useEffect(() => {
    for (const href of FONT_PRELOAD_URLS) {
      const existing = document.querySelector(`link[href="${href}"]`);
      if (!existing) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
      }
    }
  }, []);

  useEffect(() => {
    const nextLayout = sanitizeTemplateLayout(template.layout);
    const nextCanvas = sanitizeTemplateCanvas(nextLayout);
    setLayout(nextLayout);
    setCanvas(nextCanvas);
    setSelectedLayerId(nextCanvas.layers[0]?.id ?? "");
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setPreviewState("idle");
    setPreviewMessage('Layers render instantly. Click "Preview" to generate PNG.');

    // Load source image immediately
    void loadSourceImage();
  }, [template]);

  // Load source image for background
  async function loadSourceImage() {
    try {
      const response = await fetchTemplateSource(template.template.id);
      if (response.ok) {
        const blob = await response.blob();
        const contentType = response.headers.get("Content-Type") || "image/png";
        const url = URL.createObjectURL(blob);
        setSourceImageUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return url;
        });
      }
    } catch {
      // Source image loading failed - continue without background
    }
  }

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  // NOTE: renderPreview is now only called manually via "Preview" button
  // No automatic rendering on changes

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      );
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      if (!selectedLayerId) {
        return;
      }

      event.preventDefault();
      removeLayer(selectedLayerId);
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [selectedLayerId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (selectedLayer?.kind !== "text") {
      setIsTextSettingsOpen(false);
    }
  }, [selectedLayer?.kind]);

  useEffect(() => {
    if (!isTextSettingsOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsTextSettingsOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isTextSettingsOpen]);

  function applyCanvas(nextCanvas: TemplateCanvasData) {
    const nextLayout = syncLayoutWithCanvas(layoutRef.current, nextCanvas);
    const normalizedCanvas = sanitizeTemplateCanvas(nextLayout);
    layoutRef.current = nextLayout;
    canvasRef.current = normalizedCanvas;
    setLayout(nextLayout);
    setCanvas(normalizedCanvas);

    if (!normalizedCanvas.layers.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(normalizedCanvas.layers[0]?.id ?? "");
    }
  }

  function updateCanvas(updater: (current: TemplateCanvasData) => TemplateCanvasData) {
    applyCanvas(updater(canvasRef.current));
  }

  function updateSelectedLayer(updater: (layer: TemplateCanvasLayer) => TemplateCanvasLayer) {
    if (!selectedLayer) {
      return;
    }

    updateCanvas((current) =>
      updateCanvasLayers(current, (layers) =>
        layers.map((layer) => {
          if (layer.id !== selectedLayer.id) {
            return layer;
          }

          return clampLayerToLayout(updater(layer), layoutRef.current);
        }),
      ),
    );
  }

  function getStagePoint(clientX: number, clientY: number) {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      x: ((clientX - rect.left) / rect.width) * layoutRef.current.page_width,
      y: ((clientY - rect.top) / rect.height) * layoutRef.current.page_height,
    };
  }

  function getStageDelta(deltaClientX: number, deltaClientY: number) {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      x: (deltaClientX / rect.width) * layoutRef.current.page_width,
      y: (deltaClientY / rect.height) * layoutRef.current.page_height,
    };
  }

  function beginLayerDrag(layer: TemplateCanvasLayer, event: ReactPointerEvent<HTMLButtonElement>) {
    const point = getStagePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setSelectedLayerId(layer.id);
    dragRef.current = {
      layerId: layer.id,
      offsetX: point.x - layer.x,
      offsetY: point.y - layer.y,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleLayerDragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const point = getStagePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const SNAP_THRESHOLD = 15;
    const layout = layoutRef.current;
    const centerX = layout.page_width / 2;
    const centerY = layout.page_height / 2;

    let nextX = Math.round(point.x - drag.offsetX);
    let nextY = Math.round(point.y - drag.offsetY);

    const layer = canvasRef.current.layers.find((l) => l.id === drag.layerId);
    if (layer) {
      const layerCenterX = nextX + layer.width / 2;
      const layerCenterY = nextY + layer.height / 2;

      const snapX = Math.abs(layerCenterX - centerX) < SNAP_THRESHOLD;
      const snapY = Math.abs(layerCenterY - centerY) < SNAP_THRESHOLD;

      if (snapX) {
        nextX = Math.round(centerX - layer.width / 2);
      }
      if (snapY) {
        nextY = Math.round(centerY - layer.height / 2);
      }

      setSnapGuides({
        vertical: snapX ? centerX : null,
        horizontal: snapY ? centerY : null,
      });
    }

    updateCanvas((current) =>
      updateCanvasLayers(current, (layers) =>
        layers.map((layer) => {
          if (layer.id !== drag.layerId) {
            return layer;
          }

          return clampLayerToLayout(
            {
              ...layer,
              x: nextX,
              y: nextY,
            },
            layoutRef.current,
          );
        }),
      ),
    );
  }

  function endLayerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setSnapGuides({ vertical: null, horizontal: null });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function beginResize(
    layer: TemplateCanvasLayer,
    mode: ResizeMode,
    event: ReactPointerEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedLayerId(layer.id);
    resizeRef.current = {
      layerId: layer.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLayer: layer,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    const delta = getStageDelta(event.clientX - resize.startX, event.clientY - resize.startY);
    if (!delta) {
      return;
    }

    const minWidth = resize.startLayer.kind === "image" ? 60 : 180;
    const minHeight = resize.startLayer.kind === "image" ? 60 : 56;

    updateCanvas((current) =>
      updateCanvasLayers(current, (layers) =>
        layers.map((layer) => {
          if (layer.id !== resize.layerId) {
            return layer;
          }

          const rightEdge = resize.startLayer.x + resize.startLayer.width;
          const bottomEdge = resize.startLayer.y + resize.startLayer.height;

          switch (resize.mode) {
            case "left": {
              const nextX = clampToRange(resize.startLayer.x + delta.x, 0, rightEdge - minWidth);
              return {
                ...layer,
                x: Math.round(nextX),
                width: Math.round(rightEdge - nextX),
              };
            }
            case "right": {
              const nextWidth = clampToRange(
                resize.startLayer.width + delta.x,
                minWidth,
                layoutRef.current.page_width - resize.startLayer.x,
              );
              return { ...layer, width: Math.round(nextWidth) };
            }
            case "top": {
              const nextY = clampToRange(resize.startLayer.y + delta.y, 0, bottomEdge - minHeight);
              return {
                ...layer,
                y: Math.round(nextY),
                height: Math.round(bottomEdge - nextY),
              };
            }
            case "bottom": {
              const nextHeight = clampToRange(
                resize.startLayer.height + delta.y,
                minHeight,
                layoutRef.current.page_height - resize.startLayer.y,
              );
              return { ...layer, height: Math.round(nextHeight) };
            }
            case "top-left": {
              const nextX = clampToRange(resize.startLayer.x + delta.x, 0, rightEdge - minWidth);
              const nextY = clampToRange(resize.startLayer.y + delta.y, 0, bottomEdge - minHeight);
              return {
                ...layer,
                x: Math.round(nextX),
                y: Math.round(nextY),
                width: Math.round(rightEdge - nextX),
                height: Math.round(bottomEdge - nextY),
              };
            }
            case "top-right": {
              const nextWidth = clampToRange(
                resize.startLayer.width + delta.x,
                minWidth,
                layoutRef.current.page_width - resize.startLayer.x,
              );
              const nextY = clampToRange(resize.startLayer.y + delta.y, 0, bottomEdge - minHeight);
              return {
                ...layer,
                y: Math.round(nextY),
                width: Math.round(nextWidth),
                height: Math.round(bottomEdge - nextY),
              };
            }
            case "bottom-left": {
              const nextX = clampToRange(resize.startLayer.x + delta.x, 0, rightEdge - minWidth);
              const nextHeight = clampToRange(
                resize.startLayer.height + delta.y,
                minHeight,
                layoutRef.current.page_height - resize.startLayer.y,
              );
              return {
                ...layer,
                x: Math.round(nextX),
                width: Math.round(rightEdge - nextX),
                height: Math.round(nextHeight),
              };
            }
            case "bottom-right": {
              const nextWidth = clampToRange(
                resize.startLayer.width + delta.x,
                minWidth,
                layoutRef.current.page_width - resize.startLayer.x,
              );
              const nextHeight = clampToRange(
                resize.startLayer.height + delta.y,
                minHeight,
                layoutRef.current.page_height - resize.startLayer.y,
              );
              return {
                ...layer,
                width: Math.round(nextWidth),
                height: Math.round(nextHeight),
              };
            }
          }
        }),
      ),
    );
  }

  function endResize(event: ReactPointerEvent<HTMLElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function selectLayer(layerId: string) {
    setSelectedLayerId(layerId);
  }

  function addTextLayer() {
    const layer = createTextCanvasLayer(layoutRef.current);
    updateCanvas((current) => ({
      ...current,
      layers: [...current.layers, layer],
    }));
    setSelectedLayerId(layer.id);
  }

  function addNameLayer() {
    const layer = createTextCanvasLayer(layoutRef.current);
    layer.name = "Participant name";
    const baseText = layer.text;
    if (!baseText) {
      return;
    }
    layer.text = {
      content: "{{participant.full_name}}",
      binding: null,
      font_family: layoutRef.current.font_family,
      font_size: layoutRef.current.font_size,
      font_color_hex: layoutRef.current.font_color_hex,
      text_align: "center",
      vertical_align: "center",
      auto_shrink: true,
      font_weight: baseText.font_weight,
      letter_spacing: baseText.letter_spacing,
      line_height: baseText.line_height,
      background_color_hex: baseText.background_color_hex,
    };
    layer.role = "legacy_name";
    updateCanvas((current) => ({
      ...current,
      layers: [...current.layers, layer],
    }));
    setSelectedLayerId(layer.id);
  }

  function addImageLayer() {
    setImageTarget({ mode: "add" });
    setIsImagePickerOpen(true);
    imageInputRef.current?.click();
  }

  function duplicateLayer(layerId: string) {
    const layer = canvasRef.current.layers.find((item) => item.id === layerId);
    if (!layer) {
      return;
    }

    const duplicate = cloneLayer(layer);
    updateCanvas((current) => ({
      ...current,
      layers: [...current.layers, duplicate],
    }));
    setSelectedLayerId(duplicate.id);
  }

  function removeLayer(layerId: string) {
    updateCanvas((current) => {
      const index = current.layers.findIndex((layer) => layer.id === layerId);
      if (index === -1) {
        return current;
      }

      const nextLayers = current.layers.filter((layer) => layer.id !== layerId);
      const nextSelected = nextLayers[index] ?? nextLayers[index - 1] ?? null;
      window.setTimeout(() => {
        setSelectedLayerId(nextSelected?.id ?? "");
      }, 0);

      return {
        ...current,
        layers: nextLayers,
      };
    });
  }

  function moveLayer(layerId: string, direction: "up" | "down") {
    updateCanvas((current) => {
      const index = current.layers.findIndex((layer) => layer.id === layerId);
      if (index === -1) {
        return current;
      }

      const next = [...current.layers];
      const targetIndex = direction === "up" ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= next.length) {
        return current;
      }

      const [layer] = next.splice(index, 1);
      next.splice(targetIndex, 0, layer);
      return { ...current, layers: next };
    });
  }

  async function handleImageFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !imageTarget) {
      setIsImagePickerOpen(false);
      setImageTarget(null);
      return;
    }

    const src = await fileToDataUrl(file);
    const imageMetrics = src ? await getImageMetrics(src) : null;
    if (!src) {
      setImageTarget(null);
      setIsImagePickerOpen(false);
      return;
    }

    if (imageTarget.mode === "add") {
      const layer = createImageCanvasLayer(
        layoutRef.current,
        src,
        file.name,
        imageMetrics ?? undefined,
      );
      updateCanvas((current) => ({
        ...current,
        layers: [...current.layers, layer],
      }));
      setSelectedLayerId(layer.id);
    } else if (imageTarget.layerId) {
      const nextSize = imageMetrics
        ? getFittedImageLayerSize(layoutRef.current, imageMetrics.width, imageMetrics.height)
        : null;
      updateCanvas((current) =>
        updateCanvasLayers(current, (layers) =>
          layers.map((layer) =>
            layer.id === imageTarget.layerId && layer.kind === "image"
              ? clampLayerToLayout(
                  {
                    ...layer,
                    ...(nextSize
                      ? {
                          x: Math.round(layer.x + (layer.width - nextSize.width) / 2),
                          y: Math.round(layer.y + (layer.height - nextSize.height) / 2),
                          width: nextSize.width,
                          height: nextSize.height,
                        }
                      : null),
                    image: {
                      ...(layer.image ?? {
                        src,
                        fit: "fill",
                        border_radius: 16,
                      }),
                      src,
                      fit: "contain",
                    },
                  },
                  layoutRef.current,
                )
              : layer,
          ),
        ),
      );
      setSelectedLayerId(imageTarget.layerId);
    }

    setImageTarget(null);
    setIsImagePickerOpen(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setPreviewMessage("Saving layout...");

    try {
      const payload = sanitizeTemplateLayout({
        ...layoutRef.current,
        canvas: canvasRef.current,
      });
      const { response, data } = await saveTemplateLayout(template.template.id, payload);
      if (!response.ok || !data) {
        setPreviewState("error");
        toast.error("Layout save failed.");
        return;
      }

      const nextLayout = sanitizeTemplateLayout(data);
      const nextCanvas = sanitizeTemplateCanvas(nextLayout);
      setLayout(nextLayout);
      setCanvas(nextCanvas);
      layoutRef.current = nextLayout;
      canvasRef.current = nextCanvas;
      onSaved?.(nextLayout);
      setPreviewState((current) => (current === "error" ? "idle" : current));
      setPreviewMessage("Layout saved. Generate preview when you want to check the server render.");
      toast.success("Layout saved.");
    } catch {
      setPreviewState("error");
      toast.error("Layout save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function renderPreview(options?: { silent?: boolean }) {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    const shouldShowStatus = !options?.silent || !previewUrl;

    setPreviewState("loading");
    if (shouldShowStatus) {
      setPreviewMessage("Rendering the backend proof...");
    }

    try {
      const requestLayout = sanitizeTemplateLayout({
        ...layoutRef.current,
        canvas: canvasRef.current,
      });
      const response = await previewTemplate(template.template.id, previewName, requestLayout);
      if (requestId !== previewRequestRef.current) {
        return;
      }

      if (!response.ok) {
        if (shouldShowStatus) {
          setPreviewMessage("Preview render failed.");
        }
        setPreviewState("error");
        toast.error("Preview render failed.");
        return;
      }

      const blob = await response.blob();
      if (requestId !== previewRequestRef.current) {
        return;
      }

      const nextUrl = URL.createObjectURL(blob);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return nextUrl;
      });
      setPreviewState("ready");
      if (shouldShowStatus) {
        setPreviewMessage("Backend proof updated.");
      }
    } catch {
      if (requestId === previewRequestRef.current) {
        setPreviewState("error");
        if (shouldShowStatus) {
          setPreviewMessage("Could not render the backend proof.");
        }
        toast.error("Could not render the backend proof.");
      }
    }
  }

  const previewBoxStyles = canvas.layers.map((layer) => {
    const left = (layer.x / layout.page_width) * 100;
    const top = (layer.y / layout.page_height) * 100;
    const width = (layer.width / layout.page_width) * 100;
    const height = (layer.height / layout.page_height) * 100;

    return {
      id: layer.id,
      left,
      top,
      width,
      height,
    };
  });

  const layerCount = canvas.layers.length;
  const hasProof = previewUrl !== null;
  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        showHeader ? "admin-panel pt-1" : "h-full w-full bg-canvas",
      )}
    >
      {showHeader ? (
        <div className="shrink-0 border-b border-white/10 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <Link
                className="inline-flex min-h-11 items-center gap-2 py-2 text-sm text-white/85 backdrop-blur-xl transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                href={`/admin/templates/${template.template.id}`}
              >
                <ArrowLeft className="size-4" />
                Back to template
              </Link>
              <h2 className="mt-3 text-2xl font-black text-white">{template.template.name}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Pill>
                {layout.page_width} × {layout.page_height}
              </Pill>
            </div>
          </div>
        </div>
      ) : (
        <div className="shrink-0 flex items-center justify-between gap-3 pb-3">
          <Link
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition hover:border-primary/30 hover:text-white"
            href={`/admin/templates/${template.template.id}`}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
          <span className="min-w-0 truncate text-base font-semibold text-white">
            {template.template.name}
          </span>
          <div className="w-[72px]" />
        </div>
      )}

      <form
        className={cn(
          "grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_420px]",
          showHeader ? "mt-6" : "mt-0",
        )}
        onSubmit={(event) => void handleSave(event)}
      >
        <div className="min-h-0 flex flex-col gap-4">
          <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
                <Sparkles className="size-4 text-primary" />
                Live canvas
              </div>
            </div>

            <div className="flex-1 grid place-items-center overflow-hidden">
              <div
                ref={stageRef}
                className="relative overflow-hidden rounded-xl border border-white/10 bg-[#09090f]"
                style={{
                  aspectRatio: `${layout.page_width} / ${layout.page_height}`,
                  width: "100%",
                  maxHeight: "100%",
                }}
              >
                {/* Background image - loaded immediately from template source */}
                {sourceImageUrl ? (
                  <img
                    alt="Template background"
                    className="absolute inset-0 h-full w-full object-fill"
                    src={sourceImageUrl}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#1a1a2e]" />
                )}

                <div className="absolute inset-0">
                  {previewBoxStyles.map((box) => {
                    const layer = canvas.layers.find((item) => item.id === box.id);
                    if (!layer) {
                      return null;
                    }

                    const isSelected = layer.id === selectedLayerId;
                    const isText = layer.kind === "text";
                    return (
                      <div
                        key={layer.id}
                        className="absolute"
                        style={{
                          left: `${box.left}%`,
                          top: `${box.top}%`,
                          width: `${box.width}%`,
                          height: `${box.height}%`,
                        }}
                      >
                        <button
                          aria-label={`Move ${layer.name}`}
                          className={cn(
                            "absolute inset-0 rounded-[1rem] border border-dashed bg-transparent text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            isSelected
                              ? "border-primary/80 bg-primary/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                              : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]",
                            "cursor-move",
                          )}
                          type="button"
                          onPointerDown={(event) => beginLayerDrag(layer, event)}
                          onPointerMove={(event) => handleLayerDragMove(event)}
                          onPointerUp={(event) => endLayerDrag(event)}
                          onClick={() => selectLayer(layer.id)}
                        >
                          {isText && layer.text ? (
                            <span
                              className="pointer-events-none absolute inset-0 overflow-hidden p-1"
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent:
                                  layer.text.vertical_align === "center"
                                    ? "center"
                                    : layer.text.vertical_align === "bottom"
                                      ? "flex-end"
                                      : "flex-start",
                              }}
                            >
                              <span
                                style={{
                                  width: "100%",
                                  fontFamily: `"${layer.text.font_family}", sans-serif`,
                                  fontSize: `${Math.max(8, layer.text.font_size * 0.45)}px`,
                                  fontWeight: layer.text.font_weight,
                                  letterSpacing: `${(layer.text.letter_spacing ?? 0) * 0.45}px`,
                                  lineHeight: `${(layer.text.line_height ?? 130) / 100}`,
                                  color: layer.text.font_color_hex,
                                  textAlign: layer.text
                                    .text_align as React.CSSProperties["textAlign"],
                                  wordBreak: "break-word",
                                }}
                              >
                                {resolveCanvasLayerText(
                                  layer.text,
                                  previewName,
                                  buildPreviewBindingValues(previewName, template),
                                )}
                              </span>
                            </span>
                          ) : isText ? (
                            <span className="pointer-events-none absolute left-3 bottom-3 max-w-[calc(100%-24px)] rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[11px] text-white/60">
                              Text layer
                            </span>
                          ) : layer.kind === "image" && layer.image?.src ? (
                            <span
                              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1rem]"
                              style={{
                                padding: `${layer.image.border_radius ?? 0}px`,
                              }}
                            >
                              <img
                                alt={layer.name}
                                className="pointer-events-none h-full w-full"
                                src={layer.image.src}
                                style={{
                                  objectFit:
                                    layer.image.fit === "contain"
                                      ? "contain"
                                      : layer.image.fit === "cover"
                                        ? "cover"
                                        : "fill",
                                  borderRadius: `${layer.image.border_radius ?? 0}px`,
                                }}
                              />
                            </span>
                          ) : (
                            <span className="pointer-events-none absolute left-3 bottom-3 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[11px] text-white/60">
                              {layer.kind === "image" ? "Image layer" : "Layer"}
                            </span>
                          )}
                        </button>

                        {isSelected && (
                          <>
                            <ResizeHandle
                              position="top-left"
                              onPointerDown={(e) => beginResize(layer, "top-left", e)}
                              onPointerMove={handleResizeMove}
                              onPointerUp={endResize}
                            />
                            <ResizeHandle
                              position="top-right"
                              onPointerDown={(e) => beginResize(layer, "top-right", e)}
                              onPointerMove={handleResizeMove}
                              onPointerUp={endResize}
                            />
                            <ResizeHandle
                              position="bottom-left"
                              onPointerDown={(e) => beginResize(layer, "bottom-left", e)}
                              onPointerMove={handleResizeMove}
                              onPointerUp={endResize}
                            />
                            <ResizeHandle
                              position="bottom-right"
                              onPointerDown={(e) => beginResize(layer, "bottom-right", e)}
                              onPointerMove={handleResizeMove}
                              onPointerUp={endResize}
                            />
                            <ResizeHandle
                              position="top"
                              onPointerDown={(e) => beginResize(layer, "top", e)}
                              onPointerMove={handleResizeMove}
                              onPointerUp={endResize}
                            />
                            <ResizeHandle
                              position="bottom"
                              onPointerDown={(e) => beginResize(layer, "bottom", e)}
                              onPointerMove={handleResizeMove}
                              onPointerUp={endResize}
                            />
                            <ResizeHandle
                              position="left"
                              onPointerDown={(e) => beginResize(layer, "left", e)}
                              onPointerMove={handleResizeMove}
                              onPointerUp={endResize}
                            />
                            <ResizeHandle
                              position="right"
                              onPointerDown={(e) => beginResize(layer, "right", e)}
                              onPointerMove={handleResizeMove}
                              onPointerUp={endResize}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Snap guides */}
                  {snapGuides.vertical !== null && (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary/60"
                      style={{
                        left: `${(snapGuides.vertical / layout.page_width) * 100}%`,
                      }}
                    />
                  )}
                  {snapGuides.horizontal !== null && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 h-px bg-primary/60"
                      style={{
                        top: `${(snapGuides.horizontal / layout.page_height) * 100}%`,
                      }}
                    />
                  )}

                  {previewState === "loading" ? (
                    <div className="pointer-events-none absolute right-4 top-4 z-20">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-4 py-2 text-xs text-white/75 shadow-lg backdrop-blur-xl">
                        <LoaderCircle className="size-4 animate-spin" />
                        Rendering preview
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 grid gap-4 md:grid-cols-2">
            <button
              className="btn-hero inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/80 transition hover:border-primary/30 hover:text-white"
              type="button"
              onClick={() => addTextLayer()}
            >
              <Type className="size-4" />
              Add text block
            </button>
            <button
              className="btn-hero inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/80 transition hover:border-primary/30 hover:text-white"
              type="button"
              onClick={() => addImageLayer()}
            >
              <ImagePlus className="size-4" />
              Add image asset
            </button>
          </div>
        </div>

        <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                  Server preview
                </p>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Generate the exported PNG from the backend renderer.
                </p>
              </div>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-white transition hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                type="button"
                onClick={() => void renderPreview({ silent: false })}
              >
                {previewState === "loading" ? (
                  <LoaderCircle className="size-4 animate-spin text-primary" />
                ) : (
                  <Sparkles className="size-4 text-primary" />
                )}
                {previewState === "loading" ? "Rendering..." : hasProof ? "Regenerate" : "Generate"}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-white/72">
                Preview name
                <input
                  className="admin-input mt-2 placeholder:text-white/30"
                  placeholder="Preview Participant"
                  value={previewName}
                  onChange={(event) => setPreviewName(event.target.value)}
                />
              </label>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/65">
                {previewMessage}
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                {hasProof && previewUrl ? (
                  <img alt="Server proof preview" className="h-auto w-full" src={previewUrl} />
                ) : (
                  <div className="flex min-h-72 items-center justify-center px-6 py-10 text-center text-sm leading-6 text-white/52">
                    Generate preview to compare the live editor with the backend output.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              Layers
            </p>
            <div className="mt-3 space-y-2">
              {canvas.layers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/50">
                  No layers yet.
                </div>
              ) : (
                canvas.layers.map((layer, index) => (
                  <div
                    key={layer.id}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 transition",
                      layer.id === selectedLayerId
                        ? "border-primary/35 bg-primary/10"
                        : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]",
                    )}
                  >
                    <button
                      className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[1rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      type="button"
                      onClick={() => selectLayer(layer.id)}
                    >
                      <GripVertical className="size-4 shrink-0 text-white/35" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">{layer.name}</p>
                          {layer.role === "legacy_name" ? (
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-primary">
                              Name
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-white/45">
                          {layer.kind === "text"
                            ? layer.text?.content
                            : layer.image?.fit || "image"}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <IconButton
                        label="Duplicate layer"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          duplicateLayer(layer.id);
                        }}
                      >
                        <Copy className="size-3.5" />
                      </IconButton>
                      <IconButton
                        label="Move layer up"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          moveLayer(layer.id, "up");
                        }}
                      >
                        <ArrowUp className="size-3.5" />
                      </IconButton>
                      <IconButton
                        label="Move layer down"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          moveLayer(layer.id, "down");
                        }}
                      >
                        <ArrowDown className="size-3.5" />
                      </IconButton>
                      <IconButton
                        label="Delete layer"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          removeLayer(layer.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              Properties
            </p>

            {!selectedLayer ? (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/50">
                Select a layer to edit it.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <TextField
                  label="Layer name"
                  value={selectedLayer.name}
                  onChange={(value) =>
                    updateSelectedLayer((layer) => ({
                      ...layer,
                      name: value,
                    }))
                  }
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="X"
                    value={selectedLayer.x}
                    onChange={(value) => updateSelectedLayer((layer) => ({ ...layer, x: value }))}
                  />
                  <NumberField
                    label="Y"
                    value={selectedLayer.y}
                    onChange={(value) => updateSelectedLayer((layer) => ({ ...layer, y: value }))}
                  />
                  <NumberField
                    label="Width"
                    value={selectedLayer.width}
                    onChange={(value) =>
                      updateSelectedLayer((layer) => ({
                        ...layer,
                        width: value,
                      }))
                    }
                  />
                  <NumberField
                    label="Height"
                    value={selectedLayer.height}
                    onChange={(value) =>
                      updateSelectedLayer((layer) => ({
                        ...layer,
                        height: value,
                      }))
                    }
                  />
                </div>

                {selectedLayer.kind === "text" && selectedTextLayer ? (
                  <button
                    className="inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:border-primary/30 hover:bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    type="button"
                    onClick={() => setIsTextSettingsOpen(true)}
                  >
                    <span>
                      <span className="block text-sm font-medium text-white">Text settings</span>
                      <span className="mt-1 block text-xs text-white/50">
                        Font, color, alignment, placeholders and shrink behavior.
                      </span>
                    </span>
                    <span className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70">
                      <SlidersHorizontal className="size-4" />
                    </span>
                  </button>
                ) : null}

                {selectedLayer.kind === "image" && selectedImageLayer ? (
                  <ImageLayerEditor
                    layer={selectedLayer}
                    image={selectedImageLayer}
                    onReplace={() => {
                      setImageTarget({
                        mode: "replace",
                        layerId: selectedLayer.id,
                      });
                      setIsImagePickerOpen(true);
                      imageInputRef.current?.click();
                    }}
                    onChange={updateSelectedLayer}
                  />
                ) : null}
              </div>
            )}
          </section>

          <div className="sticky bottom-0 rounded-xl border border-white/10 bg-panel/95 p-4 backdrop-blur-xl">
            <button
              className="btn-hero inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.05] px-4 py-3 text-sm text-white/80 transition hover:border-primary/30 hover:text-white"
              type="submit"
            >
              {isSaving ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save layout
                </>
              )}
            </button>
          </div>
        </aside>
      </form>

      <input
        ref={imageInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={(event) => {
          void handleImageFileChange(event);
        }}
      />

      {isTextSettingsOpen && selectedLayer?.kind === "text" && selectedTextLayer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-panel/95 p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                  Text settings
                </p>
                <h3 className="mt-3 text-xl font-black text-white">{selectedLayer.name}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Control typography, alignment and placeholders without crowding the main sidebar.
                </p>
              </div>
              <button
                aria-label="Close text settings"
                className="inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                type="button"
                onClick={() => setIsTextSettingsOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>

            <TextLayerEditor text={selectedTextLayer} onChange={updateSelectedLayer} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TextLayerEditor({
  text,
  onChange,
}: {
  text: TemplateCanvasTextLayer;
  onChange: (updater: (layer: TemplateCanvasLayer) => TemplateCanvasLayer) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            <Type className="size-4 text-primary" />
            Content
          </div>

          <label className="block text-sm font-medium text-white/72">
            Content
            <textarea
              className="admin-input mt-2 min-h-32 text-sm placeholder:text-white/30"
              placeholder="Awarded to {{participant.full_name}}"
              value={text.content}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        content: event.target.value,
                      }
                    : current.text,
                }))
              }
            />
          </label>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-6 text-white/55">
            Use placeholders directly in the text, for example{" "}
            <code>{"{{participant.full_name}}"}</code>, <code>{"{{participant.category}}"}</code>,{" "}
            <code>{"{{template.name}}"}</code>, <code>{"{{issue.issue_date}}"}</code>, and{" "}
            <code>{"{{issue.certificate_id}}"}</code>.
          </div>

          <div className="grid grid-cols-2 gap-2">
            {BINDING_OPTIONS.slice(1).map((option) => (
              <button
                key={option.value}
                className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-left text-xs text-white/70 transition hover:border-primary/30 hover:text-white"
                type="button"
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    text: current.text
                      ? {
                          ...current.text,
                          content: current.text.content
                            ? `${current.text.content} {{${option.value}}}`
                            : `{{${option.value}}}`,
                          binding: null,
                        }
                      : current.text,
                  }))
                }
              >
                Insert {option.label.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            <SlidersHorizontal className="size-4 text-primary" />
            Style
          </div>

          <SelectField
            label="Font family"
            value={text.font_family}
            options={SAFE_FONT_OPTIONS}
            onChange={(value) =>
              onChange((current) => ({
                ...current,
                text: current.text
                  ? {
                      ...current.text,
                      font_family: value,
                    }
                  : current.text,
              }))
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="Font size"
              value={text.font_size}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        font_size: value,
                      }
                    : current.text,
                }))
              }
            />
            <NumberField
              label="Font weight"
              value={text.font_weight}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        font_weight: value,
                      }
                    : current.text,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField
              label="Font color"
              value={text.font_color_hex}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        font_color_hex: value,
                      }
                    : current.text,
                }))
              }
            />
            <NumberField
              label="Line height"
              value={text.line_height}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        line_height: value,
                      }
                    : current.text,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="Letter spacing"
              value={text.letter_spacing}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        letter_spacing: value,
                      }
                    : current.text,
                }))
              }
            />
            <ToggleRow
              checked={text.auto_shrink}
              label="Auto shrink"
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        auto_shrink: value,
                      }
                    : current.text,
                }))
              }
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <AlignmentToggleGroup
              label="Horizontal align"
              value={text.text_align}
              options={[
                {
                  label: "Left",
                  value: "left",
                  icon: <AlignLeft className="size-4" />,
                },
                {
                  label: "Center",
                  value: "center",
                  icon: <AlignCenter className="size-4" />,
                },
                {
                  label: "Right",
                  value: "right",
                  icon: <AlignRight className="size-4" />,
                },
              ]}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        text_align: value as "left" | "center" | "right",
                      }
                    : current.text,
                }))
              }
            />

            <AlignmentToggleGroup
              label="Vertical align"
              value={text.vertical_align}
              options={[
                {
                  label: "Top",
                  value: "top",
                  icon: <ArrowUp className="size-4" />,
                },
                {
                  label: "Center",
                  value: "center",
                  icon: <AlignCenter className="size-4" />,
                },
                {
                  label: "Bottom",
                  value: "bottom",
                  icon: <ArrowDown className="size-4" />,
                },
              ]}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  text: current.text
                    ? {
                        ...current.text,
                        vertical_align: value as "top" | "center" | "bottom",
                      }
                    : current.text,
                }))
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageLayerEditor({
  layer,
  image,
  onReplace,
  onChange,
}: {
  layer: TemplateCanvasLayer;
  image: NonNullable<TemplateCanvasLayer["image"]>;
  onReplace: () => void;
  onChange: (updater: (layer: TemplateCanvasLayer) => TemplateCanvasLayer) => void;
}) {
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
        <Upload className="size-4 text-primary" />
        Image settings
      </div>

      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/75 transition hover:border-primary/30 hover:text-white"
        type="button"
        onClick={onReplace}
      >
        <Upload className="size-4" />
        Replace image
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Fit"
          value={image.fit}
          options={[
            { label: "Fill", value: "fill" },
            { label: "Contain", value: "contain" },
            { label: "Cover", value: "cover" },
          ]}
          onChange={(value) =>
            onChange((current) => ({
              ...current,
              image: current.image
                ? {
                    ...current.image,
                    fit: value as "fill" | "contain" | "cover",
                  }
                : current.image,
            }))
          }
        />
        <NumberField
          label="Border radius"
          value={image.border_radius}
          onChange={(value) =>
            onChange((current) => ({
              ...current,
              image: current.image
                ? {
                    ...current.image,
                    border_radius: value,
                  }
                : current.image,
            }))
          }
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">
        Source: {layer.name}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-white/72">
      {label}
      <select
        className="admin-input mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-black/20 p-4">
      <span className="text-sm font-medium text-white/72">{label}</span>
      <input
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = normalizeHexColor(value);
  const [draft, setDraft] = useState(normalized);

  useEffect(() => {
    setDraft(normalized);
  }, [normalized]);

  return (
    <div className="block text-sm font-medium text-white/72">
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-mono text-xs text-white/50">{normalized}</span>
      </div>
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/35 px-3 py-3">
        <input
          className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/30 focus-visible:outline-none"
          inputMode="text"
          pattern="^#[0-9a-fA-F]{6}$"
          placeholder="#111827"
          value={draft}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (isValidHexColor(next)) {
              onChange(normalizeHexColor(next));
            }
          }}
          onBlur={() => {
            const next = normalizeHexColor(draft);
            setDraft(next);
            onChange(next);
          }}
        />
        <input
          aria-label={`${label} picker`}
          className="h-10 w-12 cursor-pointer rounded-xl border border-white/10 bg-black/35 p-1"
          type="color"
          value={normalized}
          onChange={(event) => {
            const next = normalizeHexColor(event.target.value);
            setDraft(next);
            onChange(next);
          }}
        />
      </div>
    </div>
  );
}

function AlignmentToggleGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string; icon: ReactNode }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-white/72">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              className={cn(
                "inline-flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isActive
                  ? "border-primary/40 bg-primary/12 text-white"
                  : "border-white/10 bg-black/20 text-white/60 hover:border-white/20 hover:text-white",
              )}
              type="button"
              onClick={() => onChange(option.value)}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72">
      <span>{label}</span>
      <input
        className="size-4 rounded border-white/20 bg-black/20 text-primary focus:ring-primary/50"
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white/70 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
      {children}
    </span>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/65">
      {text}
    </span>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-white/72">
      {label}
      <input
        className="admin-input mt-2 placeholder:text-white/30"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  if (!isValidHexColor(trimmed)) {
    return "#111827";
  }

  return `#${trimmed.slice(1).toUpperCase()}`;
}

function isValidHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function clampToRange(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function cloneLayer(layer: TemplateCanvasLayer) {
  const id = createLayerId();
  return {
    ...layer,
    id,
    name: `${layer.name} copy`,
    text: layer.text ? { ...layer.text } : layer.text,
    image: layer.image ? { ...layer.image } : layer.image,
  };
}

function createLayerId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `layer-${crypto.randomUUID()}`
    : `layer-${Math.random().toString(36).slice(2, 10)}`;
}

async function fileToDataUrl(file: File) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function getImageMetrics(src: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
      });
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function ResizeHandle({
  position,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  position: ResizeMode;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const handleSize = 10;
  const halfSize = handleSize / 2;

  const cursorMap: Record<ResizeMode, string> = {
    left: "ew-resize",
    right: "ew-resize",
    top: "ns-resize",
    bottom: "ns-resize",
    "top-left": "nwse-resize",
    "top-right": "nesw-resize",
    "bottom-left": "nesw-resize",
    "bottom-right": "nwse-resize",
  };

  const positionMap: Record<ResizeMode, React.CSSProperties> = {
    left: {
      top: "50%",
      left: -halfSize,
      width: handleSize,
      height: handleSize * 2.5,
      transform: "translateY(-50%)",
    },
    right: {
      top: "50%",
      right: -halfSize,
      width: handleSize,
      height: handleSize * 2.5,
      transform: "translateY(-50%)",
    },
    top: {
      left: "50%",
      top: -halfSize,
      width: handleSize * 2.5,
      height: handleSize,
      transform: "translateX(-50%)",
    },
    bottom: {
      left: "50%",
      bottom: -halfSize,
      width: handleSize * 2.5,
      height: handleSize,
      transform: "translateX(-50%)",
    },
    "top-left": {
      top: -halfSize,
      left: -halfSize,
      width: handleSize,
      height: handleSize,
    },
    "top-right": {
      top: -halfSize,
      right: -halfSize,
      width: handleSize,
      height: handleSize,
    },
    "bottom-left": {
      bottom: -halfSize,
      left: -halfSize,
      width: handleSize,
      height: handleSize,
    },
    "bottom-right": {
      bottom: -halfSize,
      right: -halfSize,
      width: handleSize,
      height: handleSize,
    },
  };

  return (
    <div
      className="absolute z-10 rounded-sm bg-primary/80 hover:bg-primary"
      style={{
        ...positionMap[position],
        cursor: cursorMap[position],
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
