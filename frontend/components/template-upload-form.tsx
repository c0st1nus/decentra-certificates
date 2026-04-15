"use client";

import { FileImage, FileSpreadsheet, LoaderCircle, Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { type TemplateDetail, createTemplate } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

type TemplateUploadFormProps = {
  onSaved?: (template: TemplateDetail) => void;
  title?: string;
};

export function TemplateUploadForm({
  onSaved,
  title = "Upload template",
}: TemplateUploadFormProps) {
  const [name, setName] = useState("");
  const [sourceKind, setSourceKind] = useState("png");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("PNG, JPG/JPEG and PDF assets are supported.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !file) {
      setMessage("Provide a template name and file.");
      return;
    }

    const form = new FormData();
    form.append("name", name.trim());
    form.append("source_kind", sourceKind);
    form.append("file", file);

    setIsLoading(true);
    setMessage("Uploading template...");

    try {
      const { response, data } = await createTemplate(form);
      if (!response.ok || !data) {
        setMessage("Template upload failed.");
        setIsLoading(false);
        return;
      }

      setName("");
      setSourceKind("png");
      setFile(null);
      setMessage(`Template ${data.template.name} uploaded.`);
      onSaved?.(data);
    } catch {
      setMessage("Upload failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Templates
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
        </div>
        <FileImage className="size-5 text-primary/85" />
      </div>

      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-white/72" htmlFor="template-name">
            Template name
            <input
              id="template-name"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
              disabled={isLoading}
              placeholder="Main stage certificate"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-white/72" htmlFor="template-kind">
            Asset kind
            <select
              id="template-kind"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
              disabled={isLoading}
              value={sourceKind}
              onChange={(event) => setSourceKind(event.target.value)}
            >
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
              <option value="jpeg">JPEG</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-white/72" htmlFor="template-file">
          Asset file
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4">
            <FileSpreadsheet className="size-5 text-primary/80" />
            <input
              id="template-file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              className="block w-full text-sm text-white/72 file:mr-4 file:rounded-full file:border-0 file:bg-primary/15 file:px-4 file:py-2 file:text-xs file:font-pixel file:uppercase file:tracking-[0.18em] file:text-primary hover:file:bg-primary/20"
              disabled={isLoading}
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </label>

        <button className="btn-hero glow-primary w-full rounded-2xl bg-white/[0.05]" type="submit">
          {isLoading ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Uploading
            </>
          ) : (
            <>
              <Plus aria-hidden="true" className="size-4" />
              Save template
            </>
          )}
        </button>
      </form>

      <div
        className={cn(
          "mt-5 rounded-[1.5rem] border p-4 text-sm",
          isLoading
            ? "border-primary/25 bg-primary/10 text-white"
            : "border-white/10 bg-white/[0.03] text-white/68",
        )}
      >
        {message}
      </div>
    </section>
  );
}
