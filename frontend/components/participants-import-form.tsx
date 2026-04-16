"use client";

import { FileUp, LoaderCircle, Upload } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

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
  const [message, setMessage] = useState("CSV and XLSX uploads are supported.");
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateId) {
      setMessage("Select a template first.");
      return;
    }
    if (!file) {
      setMessage("Choose a CSV or XLSX file first.");
      return;
    }

    const form = new FormData();
    form.append("event_code", templateId);
    form.append("file", file);

    setIsLoading(true);
    setMessage(`Importing participants into ${templateName ?? "the selected template"}...`);

    try {
      const { response, data } = await importParticipants(form);
      if (!response.ok || !data) {
        setMessage("Import failed.");
        setIsLoading(false);
        return;
      }

      setResult(data);
      setMessage(`Imported ${data.inserted} new participants.`);
      onImported?.(data);
    } catch {
      setMessage("Import failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Participants
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">Import CSV/XLSX</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-white/58">
            {templateName
              ? `This import will be linked to ${templateName}.`
              : "Select a template to bind incoming participants."}
          </p>
        </div>
        <FileUp className="size-5 text-primary/85" />
      </div>

      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-white/72" htmlFor="participants-file">
          CSV or XLSX file
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4">
            <Upload className="size-5 text-primary/80" />
            <input
              id="participants-file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full text-sm text-white/72 file:mr-4 file:rounded-full file:border-0 file:bg-primary/15 file:px-4 file:py-2 file:text-xs file:font-pixel file:uppercase file:tracking-[0.18em] file:text-primary hover:file:bg-primary/20"
              disabled={isLoading || !templateId}
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </label>

        <button
          className="btn-hero glow-primary w-full rounded-2xl bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!templateId}
          type="submit"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Importing
            </>
          ) : (
            <>
              <Upload className="size-4" />
              Import participants
            </>
          )}
        </button>
      </form>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <SummaryTile label="Rows" value={result ? String(result.total_rows) : "0"} />
        <SummaryTile label="Inserted" value={result ? String(result.inserted) : "0"} />
        <SummaryTile label="Updated" value={result ? String(result.updated) : "0"} />
        <SummaryTile label="Skipped" value={result ? String(result.skipped) : "0"} />
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/68">
        {message}
      </div>

      {result?.errors.length ? (
        <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-black/30 text-white/60">
              <tr>
                <th className="px-4 py-3 font-medium">Row</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Message</th>
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
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}
