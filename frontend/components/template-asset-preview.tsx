"use client";

import { FileImage, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchTemplateSource } from "@/lib/admin-api";

type TemplateAssetPreviewProps = {
  sourceKind: string;
  templateId: string;
  templateName: string;
};

type PreviewState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; url: string; contentType: string };

export function TemplateAssetPreview({
  sourceKind,
  templateId,
  templateName,
}: TemplateAssetPreviewProps) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadSource() {
      setState({ kind: "loading" });

      try {
        const response = await fetchTemplateSource(templateId);
        if (!response.ok) {
          if (!cancelled) {
            setState({ kind: "error" });
          }
          return;
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setState({
            kind: "ready",
            url: objectUrl,
            contentType:
              response.headers.get("Content-Type") || blob.type || "application/octet-stream",
          });
        }
      } catch {
        if (!cancelled) {
          setState({ kind: "error" });
        }
      }
    }

    void loadSource();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [templateId]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-sm text-white/65">
        <div className="inline-flex items-center gap-2">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
          Loading template source...
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 text-center text-sm text-red-100">
        <FileText aria-hidden="true" className="size-10 text-red-200" />
        <div className="space-y-2">
          <p className="font-medium">Could not render template asset.</p>
          <p className="leading-6 text-red-100/80">
            Refresh the page or re-upload the file if it was recently replaced.
          </p>
        </div>
        <button
          className="btn-hero rounded-2xl border border-white/10 bg-white/[0.08] text-white"
          type="button"
          onClick={() => window.location.reload()}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Reload page
        </button>
      </div>
    );
  }

  const isPdf = sourceKind.toLowerCase() === "pdf" || state.contentType.includes("pdf");

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      {isPdf ? (
        <iframe
          className="h-[560px] w-full bg-white"
          src={state.url}
          title={`${templateName} source preview`}
        />
      ) : (
        <img
          alt={`${templateName} source preview`}
          className="h-auto max-h-[560px] w-full object-contain"
          src={state.url}
        />
      )}

      <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/35 px-4 py-3 text-sm text-white/65">
        <div className="inline-flex items-center gap-2">
          <FileImage aria-hidden="true" className="size-4 text-primary/85" />
          Template source file
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
          {sourceKind.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
