"use client";

import { FileImage, LoaderCircle, Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

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
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !file) {
      toast.error("Provide a template name and file.");
      return;
    }

    const form = new FormData();
    form.append("name", name.trim());
    form.append("file", file);

    setIsLoading(true);

    try {
      const { response, data } = await createTemplate(form);
      if (!response.ok || !data) {
        toast.error("Template upload failed.");
        setIsLoading(false);
        return;
      }

      setName("");
      setFile(null);
      toast.success(`Template "${data.template.name}" uploaded.`);
      onSaved?.(data);
    } catch {
      toast.error("Upload failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
            Templates
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
        </div>
        <FileImage aria-hidden="true" className="size-5 text-primary/85" />
      </div>

      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="grid gap-4 sm:grid-cols-1">
          <label className="block text-sm font-medium text-white/80" htmlFor="template-name">
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
        </div>

        <label className="block text-sm font-medium text-white/80" htmlFor="template-file">
          Asset file
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4">
            <FileImage aria-hidden="true" className="size-5 text-primary/80" />
            <input
              id="template-file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              className="block w-full text-sm text-white/75 file:mr-4 file:rounded-full file:border-0 file:bg-primary/15 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.18em] file:text-primary hover:file:bg-primary/20"
              disabled={isLoading}
              type="file"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
              }}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-white/55">
            Format will be detected automatically from the selected file.
          </p>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoTile label="Selected file" value={file?.name ?? "No file yet"} />
          <InfoTile
            label="Detected format"
            value={file ? detectTemplateSourceKind(file.name).toUpperCase() : "-"}
          />
        </div>

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
    </section>
  );
}

function detectTemplateSourceKind(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".pdf")) {
    return "pdf";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "jpeg";
  }
  return "png";
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">{label}</p>
      <p className="mt-2 truncate text-sm text-white/75">{value}</p>
    </div>
  );
}
