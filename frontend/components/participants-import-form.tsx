"use client";

import { FileUp, LoaderCircle, Upload } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin-panel";
import { FileInputField } from "@/components/file-input-field";
import { InfoTile } from "@/components/info-tile";
import { type ImportResponse, importParticipants } from "@/lib/admin-api";

type ParticipantsImportFormProps = {
  templateId: string | null;
  templateName: string | null;
  onImported?: (result: ImportResponse) => void;
};

export function ParticipantsImportForm({
  onImported,
  templateId,
  templateName,
}: ParticipantsImportFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateId) {
      toast.error("Сначала выберите шаблон.");
      return;
    }
    if (!file) {
      toast.error("Выберите CSV или XLSX файл.");
      return;
    }

    const form = new FormData();
    form.append("event_code", templateId);
    form.append("file", file);

    setIsLoading(true);

    try {
      const { response, data } = await importParticipants(form);
      if (!response.ok || !data) {
        toast.error("Не удалось импортировать файл. Проверьте колонки email и full_name.");
        setIsLoading(false);
        return;
      }

      setResult(data);
      const categoryMessage = data.created_categories.length
        ? ` Созданы категории: ${data.created_categories.join(", ")}.`
        : "";
      toast.success(`Добавлено участников: ${data.inserted}.${categoryMessage}`);
      onImported?.(data);
    } catch {
      toast.error("Не удалось импортировать файл. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AdminPanel as="section">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Участники</p>
          <h2 className="mt-3 text-2xl font-black text-white">Загрузка CSV/XLSX</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-white/65">
            {templateName
              ? `Файл будет привязан к шаблону: ${templateName}.`
              : "Сначала выберите шаблон, к которому относятся участники."}
          </p>
        </div>
        <FileUp className="size-5 text-primary/85" />
      </div>

      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/65">
          <p className="font-semibold text-white">Формат файла</p>
          <p className="mt-1">
            Обязательные колонки: <span className="text-white">email</span> и{" "}
            <span className="text-white">full_name</span>. Колонка{" "}
            <span className="text-white">category</span> необязательна: новые значения будут созданы
            автоматически. Повторный импорт обновляет участника по email.
          </p>
        </div>

        <FileInputField
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={isLoading || !templateId}
          icon={<Upload aria-hidden="true" className="size-5 text-primary/80" />}
          id="participants-file"
          label="Файл участников"
          onFileChange={setFile}
        />

        <button
          className="btn-hero glow-primary w-full rounded-2xl bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!templateId}
          type="submit"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Импортируем
            </>
          ) : (
            <>
              <Upload className="size-4" />
              Загрузить участников
            </>
          )}
        </button>
      </form>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <InfoTile
          label="Строк"
          value={result ? String(result.total_rows) : "0"}
          valueClassName="text-lg font-black text-white"
        />
        <InfoTile
          label="Добавлено"
          value={result ? String(result.inserted) : "0"}
          valueClassName="text-lg font-black text-white"
        />
        <InfoTile
          label="Обновлено"
          value={result ? String(result.updated) : "0"}
          valueClassName="text-lg font-black text-white"
        />
        <InfoTile
          label="Пропущено"
          value={result ? String(result.skipped) : "0"}
          valueClassName="text-lg font-black text-white"
        />
        <InfoTile
          label="Новых категорий"
          value={result ? String(result.created_categories.length) : "0"}
          valueClassName="text-lg font-black text-white"
        />
      </div>

      {result?.created_categories.length ? (
        <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm leading-6 text-primary/90">
          Созданы категории: {result.created_categories.join(", ")}
        </div>
      ) : null}

      {result?.errors.length ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-black/30 text-white/60">
              <tr>
                <th className="px-4 py-3 font-medium">Строка</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {result.errors.map((error) => (
                <tr
                  key={`${error.row_number}-${error.email}-${error.message}`}
                  className="border-t border-white/10"
                >
                  <td className="px-4 py-3 text-white/70">{error.row_number}</td>
                  <td className="px-4 py-3 text-white/70">{error.email || "—"}</td>
                  <td className="px-4 py-3 text-white/70">{error.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminPanel>
  );
}
