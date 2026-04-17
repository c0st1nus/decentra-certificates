"use client";

import {
  Eye,
  FileImage,
  Layers3,
  LoaderCircle,
  MoveDiagonal2,
  Save,
  Sparkles,
  Trash2,
  Type,
  Upload,
  WandSparkles,
} from "lucide-react";
import type {
  CSSProperties,
  ChangeEvent,
  FormEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type FontFamilyOption,
  type TemplateCanvasData,
  type TemplateCanvasLayer,
  type TemplateCanvasTextLayer,
  type TemplateDetail,
  type TemplateLayoutData,
  fetchFontFamilies,
  fetchTemplateSource,
  previewTemplate,
  saveTemplateLayout,
} from "@/lib/admin-api";
import {
  clampLayerToLayout,
  createImageCanvasLayer,
  createTextCanvasLayer,
  getCanvasLayerDisplayText,
  getCanvasLayerLabel,
  isLegacyNameLayer,
  moveLayerBackward,
  moveLayerForward,
  sanitizeTemplateCanvas,
  syncLayoutWithCanvas,
  updateCanvasLayers,
} from "@/lib/template-canvas";
import {
  type TemplatePdfPreviewDiagnostics,
  type TemplatePreviewTextMetrics,
  buildTemplateSourceOverlayMetrics,
  computeTemplatePreviewMetrics,
  getTemplateNameBoxHeight,
  sanitizeTemplateLayout,
} from "@/lib/template-layout";
import { cn } from "@/lib/utils";

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

type LayerDragState = {
  layerId: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type LayerResizeState = {
  layerId: string;
  mode: ResizeMode;
  startX: number;
  startY: number;
  startLayer: TemplateCanvasLayer;
};

type SnapGuides = {
  x: boolean;
  y: boolean;
};

export function TemplateLayoutEditor({
  template,
  onSaved,
  showHeader = true,
}: TemplateLayoutEditorProps) {
  const initialLayout = useMemo(() => sanitizeTemplateLayout(template.layout), [template.layout]);
  const initialCanvas = useMemo(() => sanitizeTemplateCanvas(initialLayout), [initialLayout]);
  const [layout, setLayout] = useState<TemplateLayoutData>({
    ...initialLayout,
    canvas: initialCanvas,
  });
  const [canvas, setCanvas] = useState<TemplateCanvasData>(initialCanvas);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(initialCanvas.layers[0]?.id ?? "");
  const [previewName, setPreviewName] = useState("Preview Participant");
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [message, setMessage] = useState("Canvas is ready. Legacy name export stays in sync.");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState<string>("application/octet-stream");
  const [sourceState, setSourceState] = useState<"loading" | "ready" | "error">("loading");
  const [fontFamilies, setFontFamilies] = useState<FontFamilyOption[]>([]);
  const [pdfDiagnostics, setPdfDiagnostics] = useState<TemplatePdfPreviewDiagnostics | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [snapGuides, setSnapGuides] = useState<SnapGuides>({ x: false, y: false });
  const [imageAction, setImageAction] = useState<{
    mode: "add" | "replace";
    layerId?: string;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<LayerDragState | null>(null);
  const resizeRef = useRef<LayerResizeState | null>(null);
  const previewRequestRef = useRef(0);
  const layoutRef = useRef(layout);
  const canvasRef = useRef(canvas);
  const sourceRevision = `${template.template.id}:${template.template.updated_at}`;
  const legacyPreviewSignature = buildLegacyPreviewSignature(layout);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    const nextLayout = sanitizeTemplateLayout(template.layout);
    const nextCanvas = sanitizeTemplateCanvas(nextLayout);
    const hydratedLayout = sanitizeTemplateLayout({
      ...nextLayout,
      canvas: nextCanvas,
    });
    setLayout(hydratedLayout);
    setCanvas(nextCanvas);
    setSelectedLayerId(nextCanvas.layers[0]?.id ?? "");
    setPdfDiagnostics(null);
    setMessage("Canvas is ready. Legacy name export stays in sync.");
  }, [template]);

  useEffect(() => {
    if (!previewName.trim() || !legacyPreviewSignature) {
      return;
    }

    const requestSignature = legacyPreviewSignature;
    const timer = window.setTimeout(() => {
      if (requestSignature === buildLegacyPreviewSignature(layoutRef.current)) {
        void renderPreview({ silent: true });
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [legacyPreviewSignature, previewName]);

  useEffect(() => {
    let isMounted = true;
    let nextUrl: string | null = null;

    setSourceState("loading");
    setSourceUrl(null);
    setSourceMime("application/octet-stream");

    async function loadSource() {
      try {
        const [templateId] = sourceRevision.split(":");
        const response = await fetchTemplateSource(templateId);
        if (!response.ok) {
          throw new Error("failed to load source");
        }

        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const blob = await response.blob();
        nextUrl = URL.createObjectURL(new Blob([blob], { type: contentType }));

        if (!isMounted) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        setSourceUrl(nextUrl);
        setSourceMime(contentType);
        setSourceState("ready");
      } catch {
        if (isMounted) {
          setSourceState("error");
        }
      }
    }

    void loadSource();

    return () => {
      isMounted = false;
      if (nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [sourceRevision]);

  useEffect(() => {
    let isMounted = true;

    async function loadFontFamilies() {
      try {
        const { response, data } = await fetchFontFamilies();
        if (!isMounted || !response.ok || !data) {
          return;
        }

        setFontFamilies(data);
      } catch {
        if (isMounted) {
          setFontFamilies([]);
        }
      }
    }

    void loadFontFamilies();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const updateStageSize = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateStageSize();

    const observer = new ResizeObserver(() => {
      updateStageSize();
    });
    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, []);

  const selectedLayer =
    canvas.layers.find((layer) => layer.id === selectedLayerId) ?? canvas.layers[0] ?? null;
  const legacyLayer =
    canvas.layers.find((layer) => isLegacyNameLayer(layer)) ?? selectedLayer ?? null;
  const legacyPreviewMetrics = buildTemplateSourceOverlayMetrics(
    layout,
    previewName,
    pdfDiagnostics,
  );
  const debugRows = buildPreviewDebugRows(legacyPreviewMetrics, pdfDiagnostics);
  const debugDeltaRows = buildPreviewDebugDeltaRows(legacyPreviewMetrics, pdfDiagnostics);

  function applyCanvas(nextCanvas: TemplateCanvasData) {
    const nextLayout = syncLayoutWithCanvas(layoutRef.current, nextCanvas);
    const normalizedCanvas = sanitizeTemplateCanvas(nextLayout);
    const hydratedLayout = sanitizeTemplateLayout({
      ...nextLayout,
      canvas: normalizedCanvas,
    });

    layoutRef.current = hydratedLayout;
    canvasRef.current = normalizedCanvas;
    setLayout(hydratedLayout);
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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("Saving canvas...");

    try {
      const payload = sanitizeTemplateLayout({
        ...layoutRef.current,
        canvas: canvasRef.current,
      });
      const { response, data } = await saveTemplateLayout(template.template.id, payload);
      if (!response.ok || !data) {
        setMessage("Layout save failed.");
        setIsSaving(false);
        return;
      }

      const nextLayout = sanitizeTemplateLayout(data);
      const nextCanvas = sanitizeTemplateCanvas(nextLayout);
      const hydratedLayout = sanitizeTemplateLayout({
        ...nextLayout,
        canvas: nextCanvas,
      });
      setLayout(hydratedLayout);
      setCanvas(nextCanvas);
      setMessage("Canvas saved. Legacy PDF export kept intact.");
      onSaved?.(hydratedLayout);
      void renderPreview({ silent: false });
    } catch {
      setMessage("Layout save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function renderPreview(options?: { silent?: boolean }) {
    const requestLayout = sanitizeTemplateLayout(layoutRef.current);
    const localDiagnosticsForRequest = computeTemplatePreviewMetrics(requestLayout, previewName);
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    const shouldShowStatus = !options?.silent || !previewUrl;

    setIsRendering(true);
    if (shouldShowStatus) {
      setMessage("Rendering server PDF preview...");
    }

    try {
      const response = await previewTemplate(template.template.id, previewName, requestLayout);
      if (requestId !== previewRequestRef.current) {
        return;
      }

      if (!response.ok) {
        if (shouldShowStatus) {
          setMessage("Preview render failed.");
        }
        setIsRendering(false);
        return;
      }

      const nextDiagnostics = parsePdfPreviewDiagnostics(
        response.headers.get("X-Template-Preview-Diagnostics"),
      );
      setPdfDiagnostics(nextDiagnostics);
      if (nextDiagnostics) {
        console.info("[template-preview-diagnostics]", {
          source: localDiagnosticsForRequest,
          pdf: nextDiagnostics,
        });
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
      if (shouldShowStatus) {
        setMessage("Server PDF preview updated.");
      }
    } catch {
      if (requestId === previewRequestRef.current && shouldShowStatus) {
        setMessage("Preview render failed.");
      }
    } finally {
      if (requestId === previewRequestRef.current) {
        setIsRendering(false);
      }
    }
  }

  function getStagePoint(clientX: number, clientY: number) {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
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
    return {
      x: (deltaClientX / rect.width) * layoutRef.current.page_width,
      y: (deltaClientY / rect.height) * layoutRef.current.page_height,
    };
  }

  function beginLayerDrag(layer: TemplateCanvasLayer, event: ReactPointerEvent<HTMLDivElement>) {
    resizeRef.current = null;
    setSelectedLayerId(layer.id);
    setSnapGuides({ x: false, y: false });
    const point = getStagePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    dragRef.current = {
      layerId: layer.id,
      offsetX: point.x - layer.x,
      offsetY: point.y - layer.y,
      width: layer.width,
      height: layer.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleLayerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const point = getStagePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    updateCanvas((current) =>
      updateCanvasLayers(current, (layers) =>
        layers.map((layer) => {
          if (layer.id !== drag.layerId) {
            return layer;
          }

          let nextX = clamp(Math.round(point.x - drag.offsetX), 0, layoutRef.current.page_width);
          let nextY = clamp(Math.round(point.y - drag.offsetY), 0, layoutRef.current.page_height);
          const snapThresholdX = getSnapThreshold(layoutRef.current.page_width, stageSize.width);
          const snapThresholdY = getSnapThreshold(layoutRef.current.page_height, stageSize.height);
          const pageCenterX = layoutRef.current.page_width / 2;
          const pageCenterY = layoutRef.current.page_height / 2;
          const layerCenterX = nextX + layer.width / 2;
          const layerCenterY = nextY + layer.height / 2;
          const snapX = Math.abs(layerCenterX - pageCenterX) <= snapThresholdX;
          const snapY = Math.abs(layerCenterY - pageCenterY) <= snapThresholdY;

          if (snapX) {
            nextX = Math.round(pageCenterX - layer.width / 2);
          }

          if (snapY) {
            nextY = Math.round(pageCenterY - layer.height / 2);
          }

          setSnapGuides((currentGuides) =>
            currentGuides.x === snapX && currentGuides.y === snapY
              ? currentGuides
              : { x: snapX, y: snapY },
          );

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

  function handleLayerPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    setSnapGuides({ x: false, y: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function beginResize(
    layer: TemplateCanvasLayer,
    mode: ResizeMode,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    dragRef.current = null;
    setSelectedLayerId(layer.id);
    setSnapGuides({ x: false, y: false });
    resizeRef.current = {
      layerId: layer.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startLayer: layer,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize) {
      return;
    }

    const delta = getStageDelta(event.clientX - resize.startX, event.clientY - resize.startY);
    if (!delta) {
      return;
    }

    const minWidth = resize.startLayer.kind === "image" ? 60 : 140;
    const minHeight = resize.startLayer.kind === "image" ? 60 : 48;

    updateCanvas((current) =>
      updateCanvasLayers(current, (layers) =>
        layers.map((layer) => {
          if (layer.id !== resize.layerId) {
            return layer;
          }

          const start = resize.startLayer;
          let nextLayer = { ...layer };
          const rightEdge = start.x + start.width;
          const bottomEdge = start.y + start.height;

          switch (resize.mode) {
            case "left": {
              const nextLeft = clamp(Math.round(start.x + delta.x), 0, rightEdge - minWidth);
              nextLayer = {
                ...nextLayer,
                x: nextLeft,
                width: Math.max(minWidth, Math.round(rightEdge - nextLeft)),
              };
              break;
            }
            case "right": {
              nextLayer = {
                ...nextLayer,
                width: clamp(
                  Math.round(start.width + delta.x),
                  minWidth,
                  layoutRef.current.page_width - start.x,
                ),
              };
              break;
            }
            case "top": {
              const nextTop = clamp(Math.round(start.y + delta.y), 0, bottomEdge - minHeight);
              nextLayer = {
                ...nextLayer,
                y: nextTop,
                height: Math.max(minHeight, Math.round(bottomEdge - nextTop)),
              };
              break;
            }
            case "bottom": {
              nextLayer = {
                ...nextLayer,
                height: clamp(
                  Math.round(start.height + delta.y),
                  minHeight,
                  layoutRef.current.page_height - start.y,
                ),
              };
              break;
            }
            case "top-left": {
              const nextLeft = clamp(Math.round(start.x + delta.x), 0, rightEdge - minWidth);
              const nextTop = clamp(Math.round(start.y + delta.y), 0, bottomEdge - minHeight);
              nextLayer = {
                ...nextLayer,
                x: nextLeft,
                y: nextTop,
                width: Math.max(minWidth, Math.round(rightEdge - nextLeft)),
                height: Math.max(minHeight, Math.round(bottomEdge - nextTop)),
              };
              break;
            }
            case "top-right": {
              const nextTop = clamp(Math.round(start.y + delta.y), 0, bottomEdge - minHeight);
              nextLayer = {
                ...nextLayer,
                y: nextTop,
                width: clamp(
                  Math.round(start.width + delta.x),
                  minWidth,
                  layoutRef.current.page_width - start.x,
                ),
                height: Math.max(minHeight, Math.round(bottomEdge - nextTop)),
              };
              break;
            }
            case "bottom-left": {
              const nextLeft = clamp(Math.round(start.x + delta.x), 0, rightEdge - minWidth);
              nextLayer = {
                ...nextLayer,
                x: nextLeft,
                width: Math.max(minWidth, Math.round(rightEdge - nextLeft)),
                height: clamp(
                  Math.round(start.height + delta.y),
                  minHeight,
                  layoutRef.current.page_height - start.y,
                ),
              };
              break;
            }
            case "bottom-right": {
              nextLayer = {
                ...nextLayer,
                width: clamp(
                  Math.round(start.width + delta.x),
                  minWidth,
                  layoutRef.current.page_width - start.x,
                ),
                height: clamp(
                  Math.round(start.height + delta.y),
                  minHeight,
                  layoutRef.current.page_height - start.y,
                ),
              };
              break;
            }
          }

          return clampLayerToLayout(nextLayer, layoutRef.current);
        }),
      ),
    );
  }

  function handleResizeUp(event: ReactPointerEvent<HTMLButtonElement>) {
    resizeRef.current = null;
    setSnapGuides({ x: false, y: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      setSelectedLayerId(legacyLayer?.id ?? "");
    }
  }

  function handleAddTextLayer() {
    updateCanvas((current) =>
      updateCanvasLayers(current, (layers) => [
        ...layers,
        createTextCanvasLayer(layoutRef.current),
      ]),
    );
    setMessage("Added a new text layer.");
  }

  function handleUploadImage(mode: "add" | "replace", layerId?: string) {
    setImageAction({ mode, layerId });
    imageInputRef.current?.click();
  }

  async function handleImagePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !imageAction) {
      return;
    }

    const src = await readFileAsDataUrl(file);
    if (!src) {
      setMessage("Image upload failed.");
      return;
    }

    if (imageAction.mode === "add") {
      updateCanvas((current) =>
        updateCanvasLayers(current, (layers) => [
          ...layers,
          createImageCanvasLayer(layoutRef.current, src, file.name),
        ]),
      );
      setMessage(`Added image layer ${file.name}.`);
    } else if (imageAction.layerId) {
      setSelectedLayerId(imageAction.layerId);
      updateCanvas((current) =>
        updateCanvasLayers(current, (layers) =>
          layers.map((layer) =>
            layer.id === imageAction.layerId
              ? {
                  ...layer,
                  image: layer.image
                    ? {
                        ...layer.image,
                        src,
                      }
                    : null,
                }
              : layer,
          ),
        ),
      );
      setMessage(`Replaced image layer ${file.name}.`);
    }

    setImageAction(null);
  }

  function handleDeleteLayer(layer: TemplateCanvasLayer) {
    if (isLegacyNameLayer(layer)) {
      setMessage("Legacy participant name layer cannot be removed.");
      return;
    }

    updateCanvas((current) =>
      updateCanvasLayers(current, (layers) => layers.filter((item) => item.id !== layer.id)),
    );
    setSelectedLayerId(legacyLayer?.id ?? "");
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-panel/95 p-4 backdrop-blur-xl sm:p-5">
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="max-w-3xl">
            <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
              Canvas editor
            </p>
            <h2 className="mt-3 text-3xl font-black text-white">{template.template.name}</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Fullscreen Figma-like canvas with text and image layers. The legacy participant name
              layer still mirrors into the old export fields and server PDF preview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TopPill>{template.template.source_kind.toUpperCase()}</TopPill>
            <TopPill>
              {layout.page_width} × {layout.page_height}
            </TopPill>
            <TopPill>{canvas.layers.length} layers</TopPill>
          </div>
        </div>
      ) : null}

      <form className="mt-4 space-y-4" onSubmit={(event) => void handleSave(event)}>
        <div className="flex flex-wrap items-center gap-2 rounded-[1.5rem] border border-white/10 bg-black/20 p-3">
          <ToolbarButton onClick={handleAddTextLayer}>
            <Type className="size-4" />
            Add text
          </ToolbarButton>
          <ToolbarButton onClick={() => handleUploadImage("add")}>
            <FileImage className="size-4" />
            Add image
          </ToolbarButton>
          <ToolbarButton onClick={() => void renderPreview()}>
            {isRendering ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <WandSparkles className="size-4" />
            )}
            Server preview
          </ToolbarButton>
          <button className="btn-hero glow-primary rounded-2xl bg-white/[0.05]" type="submit">
            {isSaving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save canvas
              </>
            )}
          </button>

          <div className="ml-auto rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65">
            Legacy export layer: synced
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside className="space-y-4 rounded-[1.75rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
                <Layers3 className="size-4 text-primary" />
                Layers
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/55">
                {canvas.layers.length}
              </div>
            </div>

            <div className="space-y-2">
              {canvas.layers.map((layer, index) => (
                <div
                  key={layer.id}
                  className={cn(
                    "rounded-[1.2rem] border px-3 py-3 transition",
                    selectedLayer?.id === layer.id
                      ? "border-primary/35 bg-primary/10"
                      : "border-white/10 bg-white/[0.03] hover:border-primary/20 hover:bg-white/[0.05]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="min-w-0 flex-1 text-left"
                      type="button"
                      onClick={() => setSelectedLayerId(layer.id)}
                    >
                      <p className="truncate text-sm font-medium text-white">
                        {getCanvasLayerLabel(layer)}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/42">
                        {layer.kind}
                        {isLegacyNameLayer(layer) ? " · legacy export" : ""}
                      </p>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-white/60"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateCanvas((current) => moveLayerBackward(current, layer.id));
                        }}
                      >
                        -
                      </button>
                      <button
                        className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-white/60"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateCanvas((current) => moveLayerForward(current, layer.id));
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
                      {index + 1}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
                      {layer.width} × {layer.height}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
                      {layer.x}, {layer.y}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
                  <Sparkles className="size-4 text-primary" />
                  Canvas stage
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65">
                  <MoveDiagonal2 className="size-3.5" />
                  Drag, resize, inspect
                </div>
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(140,216,18,0.08),_transparent_32%),linear-gradient(180deg,#090A0F_0%,#0E1017_100%)] p-4">
                <div
                  ref={stageRef}
                  className="relative mx-auto overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b0b12] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
                  style={{
                    aspectRatio: `${layout.page_width} / ${layout.page_height}`,
                    maxHeight: "calc(100vh - 19rem)",
                  }}
                  onPointerDown={handleStagePointerDown}
                >
                  {sourceState === "loading" ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/55">
                      Loading template source...
                    </div>
                  ) : sourceState === "error" ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-white/55">
                      Could not load the source preview.
                    </div>
                  ) : sourceUrl ? (
                    <div className="absolute inset-0">
                      {sourceMime.includes("application/pdf") ? (
                        <iframe
                          className="h-full w-full border-0"
                          src={sourceUrl}
                          title={`${template.template.name} source preview`}
                        />
                      ) : (
                        <img alt="" className="h-full w-full object-fill" src={sourceUrl} />
                      )}
                    </div>
                  ) : null}

                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px] opacity-20" />
                  {snapGuides.y ? (
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-0 border-t border-dashed border-sky-300/90" />
                  ) : null}
                  {snapGuides.x ? (
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 z-0 w-0 border-l border-dashed border-sky-300/90" />
                  ) : null}

                  {canvas.layers.map((layer) => (
                    <CanvasLayerView
                      key={layer.id}
                      isSelected={selectedLayer?.id === layer.id}
                      layer={layer}
                      layout={layout}
                      legacyPreviewMetrics={legacyPreviewMetrics}
                      previewName={previewName}
                      onPointerDown={beginLayerDrag}
                      onPointerMove={handleLayerPointerMove}
                      onPointerUp={handleLayerPointerUp}
                      onResizeDown={beginResize}
                      onResizeMove={handleResizeMove}
                      onResizeUp={handleResizeUp}
                      onSelect={setSelectedLayerId}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/58">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                  Main stage preview includes all text and image layers.
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                  Server PDF preview still exports only the legacy participant name layer.
                </span>
              </div>
            </div>
          </div>

          <aside className="space-y-4 rounded-[1.75rem] border border-white/10 bg-black/20 p-4">
            <ControlBlock title="Preview">
              <label className="block text-sm font-medium text-white/72" htmlFor="preview-name">
                Preview participant name
                <input
                  id="preview-name"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                  value={previewName}
                  onChange={(event) => setPreviewName(event.target.value)}
                />
              </label>

              <div className="rounded-2xl border border-sky-400/15 bg-sky-400/10 p-3 text-xs leading-5 text-sky-50/90">
                Main canvas preview is instant. Server preview remains available below so the old
                participant name export can still be verified before issuance.
              </div>
            </ControlBlock>

            {selectedLayer ? (
              <ControlBlock title="Layer inspector">
                <label className="block text-sm font-medium text-white/72">
                  Layer name
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                    value={selectedLayer.name}
                    onChange={(event) =>
                      updateSelectedLayer((layer) => ({
                        ...layer,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="X"
                    value={selectedLayer.x}
                    onChange={(value) =>
                      updateSelectedLayer((layer) => ({
                        ...layer,
                        x: value,
                      }))
                    }
                  />
                  <NumberField
                    label="Y"
                    value={selectedLayer.y}
                    onChange={(value) =>
                      updateSelectedLayer((layer) => ({
                        ...layer,
                        y: value,
                      }))
                    }
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

                <RangeField
                  label="Opacity"
                  value={selectedLayer.opacity}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(value) =>
                    updateSelectedLayer((layer) => ({
                      ...layer,
                      opacity: value,
                    }))
                  }
                />

                {selectedLayer.kind === "text" && selectedLayer.text ? (
                  <TextLayerInspector
                    layer={selectedLayer}
                    onLayerChange={updateSelectedLayer}
                    options={fontFamilies}
                  />
                ) : null}

                {selectedLayer.kind === "image" && selectedLayer.image ? (
                  <ImageLayerInspector
                    layer={selectedLayer}
                    onReplace={() => handleUploadImage("replace", selectedLayer.id)}
                    onLayerChange={updateSelectedLayer}
                  />
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {!isLegacyNameLayer(selectedLayer) ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:border-red-400/30 hover:bg-red-500/15"
                      type="button"
                      onClick={() => handleDeleteLayer(selectedLayer)}
                    >
                      <Trash2 className="size-3.5" />
                      Delete layer
                    </button>
                  ) : (
                    <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                      Legacy export layer
                    </div>
                  )}
                </div>
              </ControlBlock>
            ) : null}

            <ControlBlock title="Server PDF preview">
              <button
                className="btn-hero w-full rounded-2xl border border-white/10 bg-white/[0.04]"
                type="button"
                onClick={() => void renderPreview()}
              >
                {isRendering ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Rendering
                  </>
                ) : (
                  <>
                    <Eye className="size-4" />
                    Refresh PDF preview
                  </>
                )}
              </button>

              <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/30">
                {previewUrl ? (
                  <iframe
                    className="h-[320px] w-full"
                    src={previewUrl}
                    title={`${template.template.name} preview`}
                  />
                ) : (
                  <div className="flex h-[320px] items-center justify-center px-6 text-center text-sm leading-6 text-white/55">
                    Render preview to inspect the server PDF export.
                  </div>
                )}
              </div>
            </ControlBlock>

            <details className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 text-sm text-white/72">
              <summary className="cursor-pointer list-none font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
                Legacy diagnostics
              </summary>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-pixel text-[10px] uppercase tracking-[0.18em] text-white/45">
                    Current source overlay
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {debugRows.source.map((row) => (
                      <DebugRow key={`source-${row.label}`} label={row.label} value={row.value} />
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-pixel text-[10px] uppercase tracking-[0.18em] text-white/45">
                    Last PDF preview
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {debugRows.pdf.length ? (
                      debugRows.pdf.map((row) => (
                        <DebugRow key={`pdf-${row.label}`} label={row.label} value={row.value} />
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-white/55">
                        Render preview once to capture backend metrics.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-pixel text-[10px] uppercase tracking-[0.18em] text-white/45">
                    Delta source - pdf
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {debugDeltaRows.length ? (
                      debugDeltaRows.map((row) => (
                        <DebugRow key={`delta-${row.label}`} label={row.label} value={row.value} />
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-white/55">
                        Delta appears after backend preview diagnostics arrive.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </details>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
              {message}
            </div>
          </aside>
        </div>
      </form>

      <input
        ref={imageInputRef}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        type="file"
        onChange={(event) => void handleImagePicked(event)}
      />
    </section>
  );
}

function CanvasLayerView({
  layer,
  layout,
  previewName,
  legacyPreviewMetrics,
  isSelected,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onResizeDown,
  onResizeMove,
  onResizeUp,
}: {
  layer: TemplateCanvasLayer;
  layout: TemplateLayoutData;
  previewName: string;
  legacyPreviewMetrics: TemplatePreviewTextMetrics;
  isSelected: boolean;
  onSelect: (layerId: string) => void;
  onPointerDown: (layer: TemplateCanvasLayer, event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeDown: (
    layer: TemplateCanvasLayer,
    mode: ResizeMode,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onResizeMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  if (!layer.visible) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute z-10 overflow-hidden rounded-[1rem] border transition",
        isSelected
          ? "border-sky-300/90 shadow-[0_0_0_1px_rgba(125,211,252,0.18)]"
          : "border-transparent hover:border-sky-400/45",
      )}
      style={{
        left: `${(layer.x / layout.page_width) * 100}%`,
        top: `${(layer.y / layout.page_height) * 100}%`,
        width: `${(layer.width / layout.page_width) * 100}%`,
        height: `${(layer.height / layout.page_height) * 100}%`,
        opacity: layer.opacity / 100,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(layer.id);
        onPointerDown(layer, event);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {isLegacyNameLayer(layer) ? (
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-hidden"
          preserveAspectRatio="none"
          viewBox={`0 0 ${layer.width} ${layer.height}`}
        >
          <text
            fill={layout.font_color_hex}
            fontFamily={legacyPreviewMetrics.fontFamily}
            fontSize={legacyPreviewMetrics.fontSize}
            fontWeight="400"
            textAnchor="start"
            x={legacyPreviewMetrics.textLeft}
            y={legacyPreviewMetrics.baselineTop}
          >
            {previewName || " "}
          </text>
        </svg>
      ) : layer.kind === "text" && layer.text ? (
        <div
          className="flex h-full w-full whitespace-pre-wrap break-words px-4 py-3"
          style={{
            color: layer.text.font_color_hex,
            fontFamily: layer.text.font_family,
            fontSize: `${layer.text.font_size}px`,
            fontWeight: layer.text.font_weight,
            letterSpacing: `${layer.text.letter_spacing}px`,
            lineHeight: `${layer.text.line_height}%`,
            backgroundColor: layer.text.background_color_hex || "transparent",
            justifyContent: resolveHorizontalAlign(layer.text.text_align),
            alignItems: resolveVerticalAlign(layer.text.vertical_align),
            textAlign: layer.text.text_align as CSSProperties["textAlign"],
          }}
        >
          {getCanvasLayerDisplayText(layer, previewName)}
        </div>
      ) : layer.kind === "image" && layer.image?.src ? (
        <img
          alt=""
          className="h-full w-full"
          src={layer.image.src}
          style={{
            objectFit: layer.image.fit,
            borderRadius: `${layer.image.border_radius}px`,
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.16em] text-white/35">
          Empty layer
        </div>
      )}

      {isSelected ? (
        <>
          <ResizeHandle
            ariaLabel="Resize from left edge"
            className="cursor-ew-resize"
            style={{
              left: 0,
              top: "50%",
              width: "14px",
              height: "calc(100% - 18px)",
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={(event) => onResizeDown(layer, "left", event)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            ariaLabel="Resize from right edge"
            className="cursor-ew-resize"
            style={{
              right: 0,
              top: "50%",
              width: "14px",
              height: "calc(100% - 18px)",
              transform: "translate(50%, -50%)",
            }}
            onPointerDown={(event) => onResizeDown(layer, "right", event)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            ariaLabel="Resize from top edge"
            className="cursor-ns-resize"
            style={{
              left: "50%",
              top: 0,
              width: "calc(100% - 18px)",
              height: "14px",
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={(event) => onResizeDown(layer, "top", event)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            ariaLabel="Resize from bottom edge"
            className="cursor-ns-resize"
            style={{
              left: "50%",
              bottom: 0,
              width: "calc(100% - 18px)",
              height: "14px",
              transform: "translate(-50%, 50%)",
            }}
            onPointerDown={(event) => onResizeDown(layer, "bottom", event)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            ariaLabel="Resize from top left corner"
            className="cursor-nwse-resize"
            style={{
              left: 0,
              top: 0,
              width: "18px",
              height: "18px",
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={(event) => onResizeDown(layer, "top-left", event)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            ariaLabel="Resize from top right corner"
            className="cursor-nesw-resize"
            style={{
              right: 0,
              top: 0,
              width: "18px",
              height: "18px",
              transform: "translate(50%, -50%)",
            }}
            onPointerDown={(event) => onResizeDown(layer, "top-right", event)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            ariaLabel="Resize from bottom left corner"
            className="cursor-nesw-resize"
            style={{
              left: 0,
              bottom: 0,
              width: "18px",
              height: "18px",
              transform: "translate(-50%, 50%)",
            }}
            onPointerDown={(event) => onResizeDown(layer, "bottom-left", event)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            ariaLabel="Resize from bottom right corner"
            className="cursor-nwse-resize"
            style={{
              right: 0,
              bottom: 0,
              width: "18px",
              height: "18px",
              transform: "translate(50%, 50%)",
            }}
            onPointerDown={(event) => onResizeDown(layer, "bottom-right", event)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
        </>
      ) : null}
    </div>
  );
}

function TextLayerInspector({
  layer,
  options,
  onLayerChange,
}: {
  layer: TemplateCanvasLayer;
  options: FontFamilyOption[];
  onLayerChange: (updater: (layer: TemplateCanvasLayer) => TemplateCanvasLayer) => void;
}) {
  const text = layer.text as TemplateCanvasTextLayer;
  const isBoundName = text.binding === "participant.full_name";

  return (
    <>
      {!isBoundName ? (
        <label className="block text-sm font-medium text-white/72">
          Text content
          <textarea
            className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
            value={text.content}
            onChange={(event) =>
              onLayerChange((current) => ({
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
      ) : (
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-xs leading-5 text-primary">
          This layer stays bound to `participant.full_name` so the old export fix remains intact.
        </div>
      )}

      <FontFamilyField
        label="Font family"
        value={text.font_family}
        options={options}
        onChange={(value) =>
          onLayerChange((current) => ({
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

      <ColorField
        label="Font color"
        value={text.font_color_hex}
        onChange={(value) =>
          onLayerChange((current) => ({
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

      <RangeField
        label="Font size"
        value={text.font_size}
        min={12}
        max={160}
        step={1}
        onChange={(value) =>
          onLayerChange((current) => ({
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

      <RangeField
        label="Weight"
        value={text.font_weight}
        min={300}
        max={900}
        step={100}
        onChange={(value) =>
          onLayerChange((current) => ({
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

      <RangeField
        label="Line height %"
        value={text.line_height}
        min={80}
        max={220}
        step={5}
        onChange={(value) =>
          onLayerChange((current) => ({
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

      <RangeField
        label="Letter spacing"
        value={text.letter_spacing}
        min={-8}
        max={24}
        step={1}
        onChange={(value) =>
          onLayerChange((current) => ({
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

      <div className="grid gap-3 sm:grid-cols-2">
        <AlignButtons
          active={text.text_align}
          label="Horizontal"
          options={["left", "center", "right"]}
          onSelect={(value) =>
            onLayerChange((current) => ({
              ...current,
              text: current.text
                ? {
                    ...current.text,
                    text_align: value,
                  }
                : current.text,
            }))
          }
        />
        <AlignButtons
          active={text.vertical_align}
          label="Vertical"
          options={["top", "center", "bottom"]}
          onSelect={(value) =>
            onLayerChange((current) => ({
              ...current,
              text: current.text
                ? {
                    ...current.text,
                    vertical_align: value,
                  }
                : current.text,
            }))
          }
        />
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white/75">
        <input
          checked={text.auto_shrink}
          className="size-4 rounded border-white/20 bg-black/20 text-primary focus:ring-primary/50"
          type="checkbox"
          onChange={(event) =>
            onLayerChange((current) => ({
              ...current,
              text: current.text
                ? {
                    ...current.text,
                    auto_shrink: event.target.checked,
                  }
                : current.text,
            }))
          }
        />
        Auto shrink font
      </label>
    </>
  );
}

function ImageLayerInspector({
  layer,
  onReplace,
  onLayerChange,
}: {
  layer: TemplateCanvasLayer;
  onReplace: () => void;
  onLayerChange: (updater: (layer: TemplateCanvasLayer) => TemplateCanvasLayer) => void;
}) {
  const image = layer.image;
  if (!image) {
    return null;
  }

  return (
    <>
      <button
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/72 transition hover:border-primary/30 hover:text-white"
        type="button"
        onClick={onReplace}
      >
        <Upload className="size-3.5" />
        Replace image
      </button>

      <RangeField
        label="Border radius"
        value={image.border_radius}
        min={0}
        max={48}
        step={1}
        onChange={(value) =>
          onLayerChange((current) => ({
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

      <AlignButtons
        active={image.fit}
        label="Image fit"
        options={["contain", "cover"]}
        onSelect={(value) =>
          onLayerChange((current) => ({
            ...current,
            image: current.image
              ? {
                  ...current.image,
                  fit: value as "contain" | "cover",
                }
              : current.image,
          }))
        }
      />
    </>
  );
}

function ResizeHandle({
  ariaLabel,
  className,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  ariaLabel: string;
  className: string;
  style?: CSSProperties;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "absolute z-20 rounded-full border border-sky-300/90 bg-sky-300 shadow-[0_0_0_2px_rgba(8,10,15,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
        className,
      )}
      style={style}
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

function TopPill({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
      {children}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/75 transition hover:border-primary/30 hover:text-white"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ControlBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
      <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary">{title}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function DebugRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/6 bg-black/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/42">{label}</p>
      <p className="mt-1 font-mono text-xs text-white/78">{value}</p>
    </div>
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

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white/72">{label}</span>
        <span className="font-mono text-xs text-white/52">{value}</span>
      </div>
      <input
        className="mt-3 w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function AlignButtons({
  label,
  active,
  options,
  onSelect,
}: {
  label: string;
  active: string;
  options: string[];
  onSelect: (value: string) => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
      <div className={`grid gap-2 ${options.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {options.map((option) => (
          <button
            key={option}
            className={cn(
              "rounded-2xl border px-3 py-3 text-xs uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
              active === option
                ? "border-primary/35 bg-primary/10 text-primary"
                : "border-white/10 bg-black/20 text-white/70 hover:border-primary/25 hover:bg-white/[0.04]",
            )}
            type="button"
            onClick={() => onSelect(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function FontFamilyField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FontFamilyOption[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const suggestions = options
    .filter((option) => {
      if (!query) {
        return true;
      }

      const optionLabel = option.label.toLowerCase();
      const optionValue = option.value.toLowerCase();
      return (
        optionLabel.includes(query) || optionValue.includes(query) || query.includes(optionLabel)
      );
    })
    .slice(0, 8);

  return (
    <div className="block text-sm font-medium text-white/72">
      {label}
      <div className="relative mt-2">
        <input
          className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition placeholder:text-white/30 focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder="Start typing a font name..."
          value={value}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
            }, 120);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {isOpen && suggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12] shadow-[0_18px_50px_rgba(0,0,0,0.4)]">
            {suggestions.map((option) => (
              <button
                key={option.value}
                className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-left transition last:border-b-0 hover:bg-white/[0.05]"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className="text-sm text-white">{option.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                  {option.value}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
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
  const normalizedValue = normalizeHexColor(value);
  const [draft, setDraft] = useState(normalizedValue);

  useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  return (
    <div className="block text-sm font-medium text-white/72">
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-mono text-xs text-white/52">{normalizedValue}</span>
      </div>

      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/35 px-3 py-3">
        <input
          className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          inputMode="text"
          pattern="^#[0-9a-fA-F]{6}$"
          placeholder="#111827"
          value={draft}
          onChange={(event) => {
            const nextValue = event.target.value;
            setDraft(nextValue);
            if (isValidHexColor(nextValue)) {
              onChange(normalizeHexColor(nextValue));
            }
          }}
          onBlur={() => {
            const nextValue = normalizeHexColor(draft);
            setDraft(nextValue);
            onChange(nextValue);
          }}
        />
        <span
          aria-hidden="true"
          className="h-10 w-10 shrink-0 rounded-xl border border-white/10 shadow-inner"
          style={{ backgroundColor: normalizedValue }}
        />
        <input
          aria-label={`${label} picker`}
          className="h-10 w-12 cursor-pointer rounded-xl border border-white/10 bg-black/35 p-1"
          type="color"
          value={normalizedValue}
          onChange={(event) => {
            const nextValue = normalizeHexColor(event.target.value);
            setDraft(nextValue);
            onChange(nextValue);
          }}
        />
      </div>
    </div>
  );
}

function isValidHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  if (!isValidHexColor(trimmed)) {
    return "#111827";
  }

  return `#${trimmed.slice(1).toUpperCase()}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSnapThreshold(pageSize: number, stageSize: number) {
  if (pageSize <= 0 || stageSize <= 0) {
    return 12;
  }

  return Math.max(6, (14 / stageSize) * pageSize);
}

function buildLegacyPreviewSignature(layout: TemplateLayoutData) {
  return [
    layout.page_width,
    layout.page_height,
    layout.name_x,
    layout.name_y,
    layout.name_max_width,
    layout.name_box_height,
    layout.font_family,
    layout.font_size,
    layout.font_color_hex,
    layout.text_align,
    layout.vertical_align,
    layout.auto_shrink ? 1 : 0,
  ].join(":");
}

function resolveHorizontalAlign(value: string) {
  switch (value) {
    case "center":
      return "center";
    case "right":
      return "flex-end";
    default:
      return "flex-start";
  }
}

function resolveVerticalAlign(value: string) {
  switch (value) {
    case "center":
      return "center";
    case "bottom":
      return "flex-end";
    default:
      return "flex-start";
  }
}

function parsePdfPreviewDiagnostics(value: string | null): TemplatePdfPreviewDiagnostics | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as TemplatePdfPreviewDiagnostics;
  } catch {
    return null;
  }
}

function buildPreviewDebugRows(
  sourceMetrics: TemplatePreviewTextMetrics,
  diagnostics: TemplatePdfPreviewDiagnostics | null,
) {
  return {
    source: [
      { label: "source", value: sourceMetrics.source },
      { label: "font", value: sourceMetrics.pdfFontFamily },
      { label: "font size", value: formatMetric(sourceMetrics.fontSize) },
      { label: "text left", value: formatMetric(sourceMetrics.textLeft) },
      { label: "text top", value: formatMetric(sourceMetrics.textTop) },
      { label: "baseline top", value: formatMetric(sourceMetrics.baselineTop) },
      { label: "text width", value: formatMetric(sourceMetrics.textWidth) },
      { label: "ascent ratio", value: formatMetric(sourceMetrics.ascentRatio) },
    ],
    pdf: diagnostics
      ? [
          { label: "font", value: diagnostics.pdf_font_family },
          { label: "font size", value: formatMetric(diagnostics.font_size) },
          { label: "text left", value: formatMetric(diagnostics.text_left_in_box) },
          { label: "text top", value: formatMetric(diagnostics.text_top_in_box) },
          {
            label: "baseline top",
            value: formatMetric(diagnostics.baseline_top - diagnostics.box_top),
          },
          { label: "text width", value: formatMetric(diagnostics.text_width) },
          { label: "ascent ratio", value: formatMetric(diagnostics.ascent_ratio) },
          { label: "box top", value: formatMetric(diagnostics.box_top) },
        ]
      : [],
  };
}

function buildPreviewDebugDeltaRows(
  sourceMetrics: TemplatePreviewTextMetrics,
  diagnostics: TemplatePdfPreviewDiagnostics | null,
) {
  if (!diagnostics) {
    return [];
  }

  return [
    {
      label: "text left",
      value: formatMetric(sourceMetrics.textLeft - diagnostics.text_left_in_box),
    },
    {
      label: "text top",
      value: formatMetric(sourceMetrics.textTop - diagnostics.text_top_in_box),
    },
    {
      label: "baseline top",
      value: formatMetric(
        sourceMetrics.baselineTop - (diagnostics.baseline_top - diagnostics.box_top),
      ),
    },
    {
      label: "font size",
      value: formatMetric(sourceMetrics.fontSize - diagnostics.font_size),
    },
    {
      label: "text width",
      value: formatMetric(sourceMetrics.textWidth - diagnostics.text_width),
    },
  ];
}

function formatMetric(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
