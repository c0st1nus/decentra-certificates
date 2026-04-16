"use client";

import { LoaderCircle, MoveDiagonal2, Save, Sparkles, WandSparkles } from "lucide-react";
import type { CSSProperties, FormEvent, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

import {
  type FontFamilyOption,
  type TemplateDetail,
  type TemplateLayoutData,
  fetchFontFamilies,
  fetchTemplateSource,
  previewTemplate,
  saveTemplateLayout,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

type TemplateLayoutEditorProps = {
  template: TemplateDetail;
  onSaved?: (layout: TemplateLayoutData) => void;
  showHeader?: boolean;
};

type LayoutPoint = {
  offsetX: number;
  offsetY: number;
  boxHeight: number;
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

type ResizePoint = {
  mode: ResizeMode;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
};

type SnapGuides = {
  x: boolean;
  y: boolean;
};

type PreviewTextMetrics = {
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

type PdfPreviewDiagnostics = {
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

const DEFAULT_LAYOUT: TemplateLayoutData = {
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

export function TemplateLayoutEditor({
  template,
  onSaved,
  showHeader = true,
}: TemplateLayoutEditorProps) {
  const [layout, setLayout] = useState<TemplateLayoutData>(() => sanitizeLayout(template.layout));
  const [previewName, setPreviewName] = useState("Preview Participant");
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [message, setMessage] = useState("Adjust the layout and render a live preview.");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState<string>("application/octet-stream");
  const [sourceState, setSourceState] = useState<"loading" | "ready" | "error">("loading");
  const [fontFamilies, setFontFamilies] = useState<FontFamilyOption[]>([]);
  const [pdfDiagnostics, setPdfDiagnostics] = useState<PdfPreviewDiagnostics | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [snapGuides, setSnapGuides] = useState<SnapGuides>({
    x: false,
    y: false,
  });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<LayoutPoint | null>(null);
  const resizeRef = useRef<ResizePoint | null>(null);
  const previewRequestRef = useRef(0);
  const sourceRevision = `${template.template.id}:${template.template.updated_at}`;
  const previewLayoutKey = JSON.stringify(layout);

  useEffect(() => {
    setLayout(sanitizeLayout(template.layout));
    setPdfDiagnostics(null);
    setMessage("Adjust the layout and render a live preview.");
  }, [template]);

  useEffect(() => {
    if (!previewName.trim()) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (previewLayoutKey.length >= 0) {
        void renderPreview({ silent: true });
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [previewLayoutKey, previewName]);

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

  function updateLayout(updater: (current: TemplateLayoutData) => TemplateLayoutData) {
    setLayout((current) => updater(current));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("Saving layout...");

    try {
      const { response, data } = await saveTemplateLayout(
        template.template.id,
        sanitizeLayout(layout),
      );
      if (!response.ok || !data) {
        setMessage("Layout save failed.");
        setIsSaving(false);
        return;
      }

      setLayout(sanitizeLayout(data));
      setMessage("Layout saved.");
      onSaved?.(data);
      void renderPreview({ silent: false });
    } catch {
      setMessage("Layout save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function renderPreview(options?: { silent?: boolean }) {
    const requestLayout = sanitizeLayout(layout);
    const localDiagnosticsForRequest = computePreviewTextMetrics(requestLayout, previewName);
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    const shouldShowStatus = !options?.silent || !previewUrl;

    setIsRendering(true);
    if (shouldShowStatus) {
      setMessage("Rendering preview...");
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
          delta: {
            textLeftInBox: roundToHundredths(
              localDiagnosticsForRequest.textLeft - nextDiagnostics.text_left_in_box,
            ),
            textTopInBox: roundToHundredths(
              localDiagnosticsForRequest.textTop - nextDiagnostics.text_top_in_box,
            ),
            baselineTop: roundToHundredths(
              localDiagnosticsForRequest.baselineTop - nextDiagnostics.baseline_top,
            ),
            fontSize: roundToHundredths(
              localDiagnosticsForRequest.fontSize - nextDiagnostics.font_size,
            ),
            textWidth: roundToHundredths(
              localDiagnosticsForRequest.textWidth - nextDiagnostics.text_width,
            ),
          },
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
        setMessage("Preview updated.");
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
      x: ((clientX - rect.left) / rect.width) * layout.page_width,
      y: ((clientY - rect.top) / rect.height) * layout.page_height,
    };
  }

  function getStageDelta(deltaClientX: number, deltaClientY: number) {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    return {
      x: (deltaClientX / rect.width) * layout.page_width,
      y: (deltaClientY / rect.height) * layout.page_height,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    resizeRef.current = null;
    setSnapGuides({ x: false, y: false });
    const point = getStagePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const boxHeight = getNameBoxHeight(layout);
    const boxLeft = layout.name_x;
    const boxTop = Math.max(0, layout.name_y - boxHeight);
    dragRef.current = {
      offsetX: point.x - boxLeft,
      offsetY: point.y - boxTop,
      boxHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) {
      return;
    }

    const point = getStagePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const { offsetX, offsetY, boxHeight } = dragRef.current;
    updateLayout((current) => {
      let nextLeft = clamp(
        Math.round(point.x - offsetX),
        0,
        Math.max(0, current.page_width - current.name_max_width),
      );
      let nextTop = clamp(Math.round(point.y - offsetY), 0, current.page_height - boxHeight);
      const snapThresholdX = getSnapThreshold(current.page_width, stageSize.width);
      const snapThresholdY = getSnapThreshold(current.page_height, stageSize.height);
      const pageCenterX = current.page_width / 2;
      const pageCenterY = current.page_height / 2;
      const boxCenterX = nextLeft + current.name_max_width / 2;
      const boxCenterY = nextTop + boxHeight / 2;
      const snapX = Math.abs(boxCenterX - pageCenterX) <= snapThresholdX;
      const snapY = Math.abs(boxCenterY - pageCenterY) <= snapThresholdY;

      if (snapX) {
        nextLeft = Math.round(pageCenterX - current.name_max_width / 2);
      }

      if (snapY) {
        nextTop = Math.round(pageCenterY - boxHeight / 2);
      }

      setSnapGuides((currentGuides) =>
        currentGuides.x === snapX && currentGuides.y === snapY
          ? currentGuides
          : { x: snapX, y: snapY },
      );

      return {
        ...current,
        name_x: nextLeft,
        name_y: nextTop + boxHeight,
      };
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = null;
    setSnapGuides({ x: false, y: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function beginResize(mode: ResizeMode, event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = null;
    setSnapGuides({ x: false, y: false });
    const boxHeight = getNameBoxHeight(layout);
    resizeRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: layout.name_x,
      startTop: layout.name_y - boxHeight,
      startWidth: layout.name_max_width,
      startHeight: boxHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = resizeRef.current;
    if (!state) {
      return;
    }

    const delta = getStageDelta(event.clientX - state.startX, event.clientY - state.startY);
    if (!delta) {
      return;
    }

    const deltaX = delta.x;
    const deltaY = delta.y;
    const minWidth = 240;

    updateLayout((current) => {
      const minHeight = Math.max(40, current.font_size + 16);
      switch (state.mode) {
        case "left": {
          const rightEdge = state.startLeft + state.startWidth;
          const nextLeft = clamp(Math.round(state.startLeft + deltaX), 0, rightEdge - minWidth);
          return {
            ...current,
            name_x: nextLeft,
            name_max_width: Math.max(minWidth, Math.round(rightEdge - nextLeft)),
          };
        }
        case "right": {
          const nextWidth = clamp(
            Math.round(state.startWidth + deltaX),
            minWidth,
            current.page_width - state.startLeft,
          );
          return {
            ...current,
            name_max_width: nextWidth,
          };
        }
        case "top": {
          const bottomEdge = state.startTop + state.startHeight;
          const nextTop = clamp(Math.round(state.startTop + deltaY), 0, bottomEdge - minHeight);
          return {
            ...current,
            name_y: bottomEdge,
            name_box_height: Math.round(bottomEdge - nextTop),
          };
        }
        case "bottom": {
          const nextHeight = clamp(
            Math.round(state.startHeight + deltaY),
            minHeight,
            current.page_height - state.startTop,
          );
          return {
            ...current,
            name_box_height: nextHeight,
            name_y: Math.round(state.startTop + nextHeight),
          };
        }
        case "top-left": {
          const rightEdge = state.startLeft + state.startWidth;
          const nextLeft = clamp(Math.round(state.startLeft + deltaX), 0, rightEdge - minWidth);
          const bottomEdge = state.startTop + state.startHeight;
          const nextTop = clamp(Math.round(state.startTop + deltaY), 0, bottomEdge - minHeight);
          return {
            ...current,
            name_x: nextLeft,
            name_max_width: Math.max(minWidth, Math.round(rightEdge - nextLeft)),
            name_y: bottomEdge,
            name_box_height: Math.round(bottomEdge - nextTop),
          };
        }
        case "top-right": {
          const nextWidth = clamp(
            Math.round(state.startWidth + deltaX),
            minWidth,
            current.page_width - state.startLeft,
          );
          const bottomEdge = state.startTop + state.startHeight;
          const nextTop = clamp(Math.round(state.startTop + deltaY), 0, bottomEdge - minHeight);
          return {
            ...current,
            name_max_width: nextWidth,
            name_y: bottomEdge,
            name_box_height: Math.round(bottomEdge - nextTop),
          };
        }
        case "bottom-left": {
          const rightEdge = state.startLeft + state.startWidth;
          const nextLeft = clamp(Math.round(state.startLeft + deltaX), 0, rightEdge - minWidth);
          const nextHeight = clamp(
            Math.round(state.startHeight + deltaY),
            minHeight,
            current.page_height - state.startTop,
          );
          return {
            ...current,
            name_x: nextLeft,
            name_max_width: Math.max(minWidth, Math.round(rightEdge - nextLeft)),
            name_box_height: nextHeight,
            name_y: Math.round(state.startTop + nextHeight),
          };
        }
        case "bottom-right": {
          const nextWidth = clamp(
            Math.round(state.startWidth + deltaX),
            minWidth,
            current.page_width - state.startLeft,
          );
          const nextHeight = clamp(
            Math.round(state.startHeight + deltaY),
            minHeight,
            current.page_height - state.startTop,
          );
          return {
            ...current,
            name_max_width: nextWidth,
            name_box_height: nextHeight,
            name_y: Math.round(state.startTop + nextHeight),
          };
        }
      }
    });
  }

  function handleResizeUp(event: ReactPointerEvent<HTMLButtonElement>) {
    resizeRef.current = null;
    setSnapGuides({ x: false, y: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const dragBoxHeight = getNameBoxHeight(layout);
  const dragBoxTop = Math.max(0, layout.name_y - dragBoxHeight);
  const dragBoxWidth = Math.min(layout.page_width, Math.max(240, layout.name_max_width));
  const dragBoxLeftPercent = (layout.name_x / layout.page_width) * 100;
  const dragBoxTopPercent = (dragBoxTop / layout.page_height) * 100;
  const dragBoxWidthPercent = (dragBoxWidth / layout.page_width) * 100;
  const dragBoxHeightPercent = (dragBoxHeight / layout.page_height) * 100;
  const previewTextMetrics = buildSourceOverlayMetrics(layout, previewName, pdfDiagnostics);
  const debugRows = buildPreviewDebugRows(previewTextMetrics, pdfDiagnostics);
  const debugDeltaRows = buildPreviewDebugDeltaRows(previewTextMetrics, pdfDiagnostics);
  const usingBackendOverlay = previewTextMetrics.source !== "local";

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
              Layout editor
            </p>
            <h2 className="mt-3 text-2xl font-black text-white">{template.template.name}</h2>
            <p className="mt-2 text-sm text-white/60">
              Drag the name box on top of the source preview, then refine the exact position and
              typography in the control panel.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
              {template.template.source_kind.toUpperCase()}
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
              {layout.page_width} × {layout.page_height}
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
              Overlay: {usingBackendOverlay ? "backend" : "local"}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
              Layout editor
            </p>
            <p className="mt-3 max-w-2xl text-sm text-white/60">
              Replace the source asset if needed, then position the participant name directly on the
              persisted template.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
              {template.template.source_kind.toUpperCase()}
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
              {layout.page_width} × {layout.page_height}
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
              Overlay: {usingBackendOverlay ? "backend" : "local"}
            </div>
          </div>
        </div>
      )}

      <form className="mt-6 space-y-6" onSubmit={(event) => void handleSave(event)}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
                  <Sparkles className="size-4 text-primary" />
                  Source preview
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65">
                  <MoveDiagonal2 className="size-3.5" />
                  Drag the box
                </div>
              </div>

              <div
                ref={stageRef}
                className="relative mt-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0a0a0f]"
                style={{
                  aspectRatio: `${layout.page_width} / ${layout.page_height}`,
                }}
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

                <button
                  aria-label="Drag the name area"
                  className="absolute z-10 cursor-grab overflow-hidden rounded-[1rem] border border-sky-400/80 bg-transparent px-0 py-0 text-left shadow-[0_0_0_1px_rgba(96,165,250,0.1)] transition hover:border-sky-300/90 active:cursor-grabbing"
                  style={{
                    left: `${dragBoxLeftPercent}%`,
                    top: `${dragBoxTopPercent}%`,
                    width: `${dragBoxWidthPercent}%`,
                    height: `${dragBoxHeightPercent}%`,
                  }}
                  type="button"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <span className="sr-only">Editable name area</span>
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
                    preserveAspectRatio="none"
                    viewBox={`0 0 ${dragBoxWidth} ${dragBoxHeight}`}
                  >
                    <text
                      fill={layout.font_color_hex}
                      fontFamily={previewTextMetrics.fontFamily}
                      fontSize={previewTextMetrics.fontSize}
                      fontWeight="400"
                      textAnchor="start"
                      x={previewTextMetrics.textLeft}
                      y={previewTextMetrics.baselineTop}
                    >
                      {previewName || " "}
                    </text>
                  </svg>
                </button>

                <ResizeHandle
                  ariaLabel="Resize from left edge"
                  className="cursor-ew-resize"
                  style={{
                    left: `${dragBoxLeftPercent}%`,
                    top: `${dragBoxTopPercent + dragBoxHeightPercent / 2}%`,
                    width: "14px",
                    height: `${Math.max(28, stageSize.height * (dragBoxHeightPercent / 100) - 16)}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                  onPointerDown={(event) => beginResize("left", event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                />
                <ResizeHandle
                  ariaLabel="Resize from right edge"
                  className="cursor-ew-resize"
                  style={{
                    left: `${dragBoxLeftPercent + dragBoxWidthPercent}%`,
                    top: `${dragBoxTopPercent + dragBoxHeightPercent / 2}%`,
                    width: "14px",
                    height: `${Math.max(28, stageSize.height * (dragBoxHeightPercent / 100) - 16)}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                  onPointerDown={(event) => beginResize("right", event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                />
                <ResizeHandle
                  ariaLabel="Resize from top edge"
                  className="cursor-ns-resize"
                  style={{
                    left: `${dragBoxLeftPercent + dragBoxWidthPercent / 2}%`,
                    top: `${dragBoxTopPercent}%`,
                    width: `${Math.max(28, stageSize.width * (dragBoxWidthPercent / 100) - 16)}px`,
                    height: "14px",
                    transform: "translate(-50%, -50%)",
                  }}
                  onPointerDown={(event) => beginResize("top", event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                />
                <ResizeHandle
                  ariaLabel="Resize from bottom edge"
                  className="cursor-ns-resize"
                  style={{
                    left: `${dragBoxLeftPercent + dragBoxWidthPercent / 2}%`,
                    top: `${dragBoxTopPercent + dragBoxHeightPercent}%`,
                    width: `${Math.max(28, stageSize.width * (dragBoxWidthPercent / 100) - 16)}px`,
                    height: "14px",
                    transform: "translate(-50%, -50%)",
                  }}
                  onPointerDown={(event) => beginResize("bottom", event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                />
                <ResizeHandle
                  ariaLabel="Resize from top left corner"
                  className="cursor-nwse-resize"
                  style={{
                    left: `${dragBoxLeftPercent}%`,
                    top: `${dragBoxTopPercent}%`,
                    width: "18px",
                    height: "18px",
                    transform: "translate(-50%, -50%)",
                  }}
                  onPointerDown={(event) => beginResize("top-left", event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                />
                <ResizeHandle
                  ariaLabel="Resize from top right corner"
                  className="cursor-nesw-resize"
                  style={{
                    left: `${dragBoxLeftPercent + dragBoxWidthPercent}%`,
                    top: `${dragBoxTopPercent}%`,
                    width: "18px",
                    height: "18px",
                    transform: "translate(-50%, -50%)",
                  }}
                  onPointerDown={(event) => beginResize("top-right", event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                />
                <ResizeHandle
                  ariaLabel="Resize from bottom left corner"
                  className="cursor-nesw-resize"
                  style={{
                    left: `${dragBoxLeftPercent}%`,
                    top: `${dragBoxTopPercent + dragBoxHeightPercent}%`,
                    width: "18px",
                    height: "18px",
                    transform: "translate(-50%, -50%)",
                  }}
                  onPointerDown={(event) => beginResize("bottom-left", event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                />
                <ResizeHandle
                  ariaLabel="Resize from bottom right corner"
                  className="cursor-nwse-resize"
                  style={{
                    left: `${dragBoxLeftPercent + dragBoxWidthPercent}%`,
                    top: `${dragBoxTopPercent + dragBoxHeightPercent}%`,
                    width: "18px",
                    height: "18px",
                    transform: "translate(-50%, -50%)",
                  }}
                  onPointerDown={(event) => beginResize("bottom-right", event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-white/45">
                    Horizontal
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["left", "center", "right"] as const).map((align) => (
                      <button
                        key={align}
                        className={cn(
                          "rounded-2xl border px-3 py-3 text-xs uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                          layout.text_align === align
                            ? "border-primary/35 bg-primary/10 text-primary"
                            : "border-white/10 bg-black/20 text-white/70 hover:border-primary/25 hover:bg-white/[0.04]",
                        )}
                        type="button"
                        onClick={() =>
                          updateLayout((current) => ({
                            ...current,
                            text_align: align,
                          }))
                        }
                      >
                        {align}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-white/45">Vertical</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["top", "center", "bottom"] as const).map((align) => (
                      <button
                        key={align}
                        className={cn(
                          "rounded-2xl border px-3 py-3 text-xs uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                          layout.vertical_align === align
                            ? "border-primary/35 bg-primary/10 text-primary"
                            : "border-white/10 bg-black/20 text-white/70 hover:border-primary/25 hover:bg-white/[0.04]",
                        )}
                        type="button"
                        onClick={() =>
                          updateLayout((current) => ({
                            ...current,
                            vertical_align: align,
                          }))
                        }
                      >
                        {align}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/50">
                <Sparkles className="size-4 text-primary" />
                Live PDF preview
              </div>
              <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/30">
                {previewUrl ? (
                  <iframe
                    className="h-[520px] w-full"
                    src={previewUrl}
                    title={`${template.template.name} preview`}
                  />
                ) : (
                  <div className="flex h-[520px] items-center justify-center px-6 text-center text-sm leading-6 text-white/55">
                    Render a preview to inspect the generated PDF here.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <ControlBlock title="Typography">
              <FontFamilyField
                label="Font family"
                value={layout.font_family}
                onChange={(value) =>
                  updateLayout((current) => ({
                    ...current,
                    font_family: value,
                  }))
                }
                options={fontFamilies}
              />
              <ColorField
                label="Font color"
                value={layout.font_color_hex}
                onChange={(value) =>
                  updateLayout((current) => ({
                    ...current,
                    font_color_hex: value,
                  }))
                }
              />

              <RangeField
                max={120}
                min={16}
                step={1}
                value={layout.font_size}
                onChange={(value) => updateLayout((current) => ({ ...current, font_size: value }))}
                label="Font size"
              />

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white/75">
                <input
                  checked={layout.auto_shrink}
                  className="size-4 rounded border-white/20 bg-black/20 text-primary focus:ring-primary/50"
                  type="checkbox"
                  onChange={(event) =>
                    updateLayout((current) => ({
                      ...current,
                      auto_shrink: event.target.checked,
                    }))
                  }
                />
                Auto shrink font
              </label>
            </ControlBlock>

            <ControlBlock title="Preview">
              <label className="block text-sm font-medium text-white/72" htmlFor="preview-name">
                Preview name
                <input
                  id="preview-name"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                  value={previewName}
                  onChange={(event) => setPreviewName(event.target.value)}
                />
              </label>

              <button
                className="btn-hero mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04]"
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
                    <WandSparkles className="size-4" />
                    Refresh preview
                  </>
                )}
              </button>
              <p className="text-xs leading-5 text-white/45">
                Preview updates automatically after the test name changes. Saving layout also
                refreshes the PDF preview.
              </p>
            </ControlBlock>

            <button
              className="btn-hero glow-primary w-full rounded-2xl bg-white/[0.05]"
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

            <details className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 text-sm text-white/72">
              <summary className="cursor-pointer list-none font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
                Render diagnostics
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
          </div>
        </div>
      </form>
    </section>
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
        "absolute z-20 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
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
        <p className="mt-2 text-xs leading-5 text-white/40">
          Suggestions come from the backend list of supported fonts.
        </p>
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

function getNameBoxHeight(layout: TemplateLayoutData) {
  return Math.max(40, toInt(layout.name_box_height, DEFAULT_LAYOUT.name_box_height));
}

function sanitizeLayout(layout?: Partial<TemplateLayoutData> | null): TemplateLayoutData {
  const source = layout ?? DEFAULT_LAYOUT;
  const pageWidth = toInt(source.page_width, DEFAULT_LAYOUT.page_width);
  const pageHeight = toInt(source.page_height, DEFAULT_LAYOUT.page_height);
  const boxHeight = Math.max(40, toInt(source.name_box_height, DEFAULT_LAYOUT.name_box_height));
  const nameX = clamp(toInt(source.name_x, DEFAULT_LAYOUT.name_x), 0, Math.max(0, pageWidth - 240));
  const nameWidth = clamp(
    toInt(source.name_max_width, DEFAULT_LAYOUT.name_max_width),
    240,
    Math.max(240, pageWidth - nameX),
  );
  const nameY = clamp(toInt(source.name_y, DEFAULT_LAYOUT.name_y), boxHeight, pageHeight);
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
        : DEFAULT_LAYOUT.font_family,
    font_size: clamp(toInt(source.font_size, DEFAULT_LAYOUT.font_size), 16, 120),
    font_color_hex:
      typeof source.font_color_hex === "string" && source.font_color_hex.trim()
        ? normalizeHexColor(source.font_color_hex)
        : DEFAULT_LAYOUT.font_color_hex,
    text_align:
      source.text_align === "left" ||
      source.text_align === "center" ||
      source.text_align === "right"
        ? source.text_align
        : DEFAULT_LAYOUT.text_align,
    vertical_align:
      source.vertical_align === "top" ||
      source.vertical_align === "center" ||
      source.vertical_align === "bottom"
        ? source.vertical_align
        : DEFAULT_LAYOUT.vertical_align,
    auto_shrink:
      typeof source.auto_shrink === "boolean" ? source.auto_shrink : DEFAULT_LAYOUT.auto_shrink,
  };
}

function toInt(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function getSnapThreshold(pageSize: number, stageSize: number) {
  if (pageSize <= 0 || stageSize <= 0) {
    return 12;
  }

  return Math.max(6, (14 / stageSize) * pageSize);
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

function computePreviewTextMetrics(layout: TemplateLayoutData, text: string): PreviewTextMetrics {
  const pdfFontFamily = resolvePdfFontFamily(layout.font_family);
  const previewFontFamily = resolvePreviewFontFamily(pdfFontFamily);
  const pdfFontSize = computePreviewFontSize(layout, text);
  const boxWidth = Math.min(layout.page_width, Math.max(240, layout.name_max_width));
  const boxHeight = getNameBoxHeight(layout);
  const textWidth = roundToHundredths(estimateTextWidth(text, pdfFontSize, pdfFontFamily));
  const textTop = roundToHundredths(computePreviewTextTop(layout, boxHeight, pdfFontSize));
  const ascentRatio = resolvePdfTextAscentRatio(pdfFontFamily);

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

function buildSourceOverlayMetrics(
  layout: TemplateLayoutData,
  text: string,
  diagnostics: PdfPreviewDiagnostics | null,
) {
  const localMetrics = computePreviewTextMetrics(layout, text);
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

function computePreviewTextTop(layout: TemplateLayoutData, boxHeight: number, fontSize: number) {
  switch (layout.vertical_align) {
    case "top":
      return NAME_BOX_INSET;
    case "bottom":
      return boxHeight - fontSize - NAME_BOX_INSET;
    default:
      return (boxHeight - fontSize) / 2;
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

function parsePdfPreviewDiagnostics(value: string | null): PdfPreviewDiagnostics | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as PdfPreviewDiagnostics;
  } catch {
    return null;
  }
}

function diagnosticsMatchLayout(
  diagnostics: PdfPreviewDiagnostics,
  layout: TemplateLayoutData,
  previewName: string,
) {
  const boxHeight = getNameBoxHeight(layout);
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

function buildPreviewDebugRows(
  sourceMetrics: PreviewTextMetrics,
  diagnostics: PdfPreviewDiagnostics | null,
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
  sourceMetrics: PreviewTextMetrics,
  diagnostics: PdfPreviewDiagnostics | null,
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
  return roundToHundredths(value).toFixed(2);
}

function estimateTextUnits(text: string, fontFamily: string) {
  const normalized = fontFamily.toLowerCase();
  const familyFactor =
    normalized === "times-roman"
      ? 0.98
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
  switch (fontFamily) {
    case "Times-Roman":
      return 0.9;
    case "Courier":
      return 0.83;
    case "Symbol":
    case "ZapfDingbats":
      return 0.88;
    default:
      return 0.93;
  }
}
