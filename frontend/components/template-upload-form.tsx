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
  title = "Загрузить шаблон",
}: TemplateUploadFormProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !file) {
      toast.error("Укажите название шаблона и выберите файл.");
      return;
    }

    const form = new FormData();
    form.append("name", name.trim());
    form.append("file", file);

    setIsLoading(true);

    try {
      const { response, data } = await createTemplate(form);
      if (!response.ok || !data) {
        toast.error("Не удалось загрузить шаблон. Проверьте файл и попробуйте ещё раз.");
        setIsLoading(false);
        return;
      }

      setName("");
      setFile(null);
      toast.success(`Шаблон "${data.template.name}" загружен.`);
      onSaved?.(data);
    } catch {
      toast.error("Загрузка не удалась. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AdminPanel as="section">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Шаблоны</p>
          <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
            Загрузите изображение или PDF сертификата. После этого настройте область ФИО в редакторе
            макета.
          </p>
        </div>
        <FileImage aria-hidden="true" className="size-5 text-primary/85" />
      </div>

      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="grid gap-4 sm:grid-cols-1">
          <label className="block text-sm font-medium text-white/80" htmlFor="template-name">
            Название шаблона
            <input
              id="template-name"
              className="admin-input mt-2"
              disabled={isLoading}
              placeholder="Сертификат основного трека"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>

        <FileInputField
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          disabled={isLoading}
          helperText="Поддерживаются PNG, JPG и PDF. Формат определится автоматически."
          icon={<FileImage aria-hidden="true" className="size-5 text-primary/80" />}
          id="template-file"
          label="Файл сертификата"
          onFileChange={setFile}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoTile label="Выбранный файл" value={file?.name ?? "Файл ещё не выбран"} />
          <InfoTile
            label="Формат"
            value={file ? detectTemplateSourceKind(file.name).toUpperCase() : "-"}
          />
        </div>

        <button className="btn-hero glow-primary w-full rounded-2xl bg-white/[0.05]" type="submit">
          {isLoading ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Загружаем
            </>
          ) : (
            <>
              <Plus aria-hidden="true" className="size-4" />
              Сохранить шаблон
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
