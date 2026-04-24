"use client";

import { FileImage, LoaderCircle, Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin-panel";
import { FileInputField } from "@/components/file-input-field";
import { InfoTile } from "@/components/info-tile";
import { type TemplateDetail, createTemplate } from "@/lib/admin-api";

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
    <AdminPanel as="section">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Templates</p>
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
              className="admin-input mt-2"
              disabled={isLoading}
              placeholder="Main stage certificate"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>

        <FileInputField
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          disabled={isLoading}
          helperText="Format will be detected automatically from the selected file."
          icon={<FileImage aria-hidden="true" className="size-5 text-primary/80" />}
          id="template-file"
          label="Asset file"
          onFileChange={setFile}
        />

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
    </AdminPanel>
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
