"use client";

import { LoaderCircle, PenTool, Save, Sparkles, WandSparkles } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import {
  type TemplateDetail,
  type TemplateLayoutData,
  previewTemplate,
  saveTemplateLayout,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

type TemplateLayoutEditorProps = {
  template: TemplateDetail;
  onSaved?: (layout: TemplateLayoutData) => void;
};

export function TemplateLayoutEditor({ template, onSaved }: TemplateLayoutEditorProps) {
  const [layout, setLayout] = useState<TemplateLayoutData>(
    template.layout ?? {
      page_width: 1920,
      page_height: 1080,
      name_x: 420,
      name_y: 520,
      name_max_width: 1080,
      font_family: "Outfit",
      font_size: 54,
      font_color_hex: "#111827",
      text_align: "center",
      auto_shrink: true,
    },
  );
  const [previewName, setPreviewName] = useState("Preview Participant");
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [message, setMessage] = useState("Adjust the layout and render a live preview.");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setLayout(
      template.layout ?? {
        page_width: 1920,
        page_height: 1080,
        name_x: 420,
        name_y: 520,
        name_max_width: 1080,
        font_family: "Outfit",
        font_size: 54,
        font_color_hex: "#111827",
        text_align: "center",
        auto_shrink: true,
      },
    );
  }, [template]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("Saving layout...");

    try {
      const { response, data } = await saveTemplateLayout(template.template.id, layout);
      if (!response.ok || !data) {
        setMessage("Layout save failed.");
        setIsSaving(false);
        return;
      }

      setMessage("Layout saved.");
      onSaved?.(data);
    } catch {
      setMessage("Layout save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function renderPreview() {
    setIsRendering(true);
    setMessage("Rendering preview...");

    try {
      const response = await previewTemplate(template.template.id, previewName);
      if (!response.ok) {
        setMessage("Preview render failed.");
        setIsRendering(false);
        return;
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(nextUrl);
      setMessage("Preview updated.");
    } catch {
      setMessage("Preview render failed.");
    } finally {
      setIsRendering(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Layout editor
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">{template.template.name}</h2>
          <p className="mt-2 text-sm text-white/60">
            Configure the placement and typography of the participant name.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
          {template.template.source_kind.toUpperCase()}
        </div>
      </div>

      <form className="mt-6 space-y-5" onSubmit={(event) => void handleSave(event)}>
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumericField
              label="Page width"
              value={layout.page_width}
              onChange={(value) => setLayout((current) => ({ ...current, page_width: value }))}
            />
            <NumericField
              label="Page height"
              value={layout.page_height}
              onChange={(value) => setLayout((current) => ({ ...current, page_height: value }))}
            />
            <NumericField
              label="Name X"
              value={layout.name_x}
              onChange={(value) => setLayout((current) => ({ ...current, name_x: value }))}
            />
            <NumericField
              label="Name Y"
              value={layout.name_y}
              onChange={(value) => setLayout((current) => ({ ...current, name_y: value }))}
            />
            <NumericField
              label="Max width"
              value={layout.name_max_width}
              onChange={(value) => setLayout((current) => ({ ...current, name_max_width: value }))}
            />
            <NumericField
              label="Font size"
              value={layout.font_size}
              onChange={(value) => setLayout((current) => ({ ...current, font_size: value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Font family"
              value={layout.font_family}
              onChange={(value) => setLayout((current) => ({ ...current, font_family: value }))}
            />
            <TextField
              label="Font color"
              value={layout.font_color_hex}
              onChange={(value) => setLayout((current) => ({ ...current, font_color_hex: value }))}
            />
            <SelectField
              label="Text align"
              value={layout.text_align}
              onChange={(value) => setLayout((current) => ({ ...current, text_align: value }))}
              options={["left", "center", "right"]}
            />
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white/75">
              <input
                checked={layout.auto_shrink}
                className="size-4 rounded border-white/20 bg-black/20 text-primary focus:ring-primary/50"
                type="checkbox"
                onChange={(event) =>
                  setLayout((current) => ({ ...current, auto_shrink: event.target.checked }))
                }
              />
              Auto shrink font
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
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
            className="btn-hero mt-auto rounded-2xl border border-white/10 bg-white/[0.04]"
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
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/50">
              <Sparkles className="size-4 text-primary" />
              Live preview
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

          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/68">
              The backend stores layout separately from the file asset. Save changes first, then use
              preview to validate the result.
            </div>
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
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
              {message}
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

function NumericField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-medium text-white/72">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
        min={0}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
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
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-white/72">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
