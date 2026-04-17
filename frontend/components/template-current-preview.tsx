"use client";

import { Eye, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { TemplateDetail } from "@/lib/admin-api";
import { fetchTemplateSource } from "@/lib/admin-api";
import {
  buildTemplateSourceOverlayMetrics,
  getTemplateNameBoxHeight,
  sanitizeTemplateLayout,
} from "@/lib/template-layout";

type TemplateCurrentPreviewProps = {
  template: TemplateDetail;
  previewName?: string;
};

export function TemplateCurrentPreview({
  template,
  previewName = "Aruzhan Tulegenova",
}: TemplateCurrentPreviewProps) {
  const layout = useMemo(() => sanitizeTemplateLayout(template.layout), [template.layout]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState("application/octet-stream");
  const [sourceState, setSourceState] = useState<"loading" | "ready" | "error">("loading");
  const metrics = buildTemplateSourceOverlayMetrics(layout, previewName, null);
  const boxHeight = getTemplateNameBoxHeight(layout);
  const boxTop = Math.max(0, layout.name_y - boxHeight);
  const boxWidth = Math.min(layout.page_width, Math.max(240, layout.name_max_width));

  useEffect(() => {
    let isMounted = true;
    let nextUrl: string | null = null;

    setSourceState("loading");
    setSourceUrl(null);
    setSourceMime("application/octet-stream");

    async function loadSource() {
      try {
        const response = await fetchTemplateSource(template.template.id);
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
  }, [template.template.id]);

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Current sample
          </p>
          <p className="mt-2 text-sm text-white/62">
            Здесь остается только текущий пример. Полный редактор живет на отдельной странице.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
          <Eye className="size-3.5" />
          {layout.page_width} × {layout.page_height}
        </div>
      </div>

      <div
        className="relative mt-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0a0a0f]"
        style={{ aspectRatio: `${layout.page_width} / ${layout.page_height}` }}
      >
        {sourceState === "loading" ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/55">
            <LoaderCircle className="size-4 animate-spin" />
            Loading template preview...
          </div>
        ) : sourceState === "error" ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-white/55">
            Could not load the current template asset.
          </div>
        ) : sourceUrl ? (
          <div className="absolute inset-0">
            {sourceMime.includes("application/pdf") ? (
              <iframe
                className="h-full w-full border-0"
                src={sourceUrl}
                title={`${template.template.name} current sample`}
              />
            ) : (
              <img alt="" className="h-full w-full object-fill" src={sourceUrl} />
            )}
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px] opacity-15" />
        <div
          className="pointer-events-none absolute overflow-hidden rounded-[1rem] border border-sky-400/75 bg-transparent shadow-[0_0_0_1px_rgba(96,165,250,0.12)]"
          style={{
            left: `${(layout.name_x / layout.page_width) * 100}%`,
            top: `${(boxTop / layout.page_height) * 100}%`,
            width: `${(boxWidth / layout.page_width) * 100}%`,
            height: `${(boxHeight / layout.page_height) * 100}%`,
          }}
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full overflow-hidden"
            preserveAspectRatio="none"
            viewBox={`0 0 ${boxWidth} ${boxHeight}`}
          >
            <text
              fill={layout.font_color_hex}
              fontFamily={metrics.fontFamily}
              fontSize={metrics.fontSize}
              fontWeight="400"
              textAnchor="start"
              x={metrics.textLeft}
              y={metrics.baselineTop}
            >
              {previewName}
            </text>
          </svg>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/58">
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
          Align: {layout.text_align}/{layout.vertical_align}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
          Font: {layout.font_family}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
          Box: {layout.name_x}, {boxTop}, {boxWidth} × {boxHeight}
        </span>
      </div>
    </section>
  );
}
