"use client";

import { ArrowRight, Layers3, LoaderCircle, PencilLine, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  type TemplateDetail,
  activateTemplate,
  deleteTemplate,
  fetchTemplate,
  updateTemplate,
} from "@/lib/admin-api";

type Props = {
  params: { id: string };
};

export default function TemplateDetailPage({ params }: Props) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("Loading template...");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data } = await fetchTemplate(params.id);
      if (!isMounted) {
        return;
      }

      if (data) {
        setTemplate(data);
        setName(data.template.name);
        setMessage("Template loaded.");
      } else {
        setMessage("Template not found.");
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [params.id]);

  async function handleSave() {
    const form = new FormData();
    form.append("name", name);
    if (file) {
      form.append("file", file);
    }

    setIsSaving(true);
    setMessage("Saving template...");

    try {
      const { response, data } = await updateTemplate(params.id, form);
      if (!response.ok || !data) {
        setMessage("Template update failed.");
        setIsSaving(false);
        return;
      }

      setTemplate(data);
      setMessage("Template saved.");
      setFile(null);
    } catch {
      setMessage("Template update failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivate() {
    const { data } = await activateTemplate(params.id);
    if (data) {
      setTemplate(data);
      setMessage("Template activated.");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this template?")) {
      return;
    }

    const { response } = await deleteTemplate(params.id);
    if (response.ok) {
      setMessage("Template deleted.");
      router.replace("/admin/templates");
    }
  }

  if (!template) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65 backdrop-blur-xl">
        {message}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <Layers3 className="size-4 text-primary" />
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Template details
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">{template.template.name}</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Manage the uploaded asset, refresh the active flag, or jump into the layout editor.
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/68">
        {message}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
          <div className="grid gap-4">
            <label className="block text-sm font-medium text-white/72">
              Template name
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-white/72">
              Replace file
              <input
                className="mt-2 block w-full rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4 text-sm text-white/72 file:mr-4 file:rounded-full file:border-0 file:bg-primary/15 file:px-4 file:py-2 file:text-xs file:font-pixel file:uppercase file:tracking-[0.18em] file:text-primary hover:file:bg-primary/20"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-hero glow-primary rounded-2xl bg-white/[0.05]"
                type="button"
                onClick={() => void handleSave()}
              >
                {isSaving ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  <>
                    <PencilLine className="size-4" />
                    Save changes
                  </>
                )}
              </button>
              {!template.template.is_active ? (
                <button
                  className="btn-hero rounded-2xl border border-primary/25 bg-primary/10 text-primary"
                  type="button"
                  onClick={() => void handleActivate()}
                >
                  Activate
                </button>
              ) : null}
              <button
                className="btn-hero rounded-2xl border border-red-500/20 bg-red-500/10 text-red-100"
                type="button"
                onClick={() => void handleDelete()}
              >
                Delete
              </button>
              <Link
                className="btn-hero rounded-2xl border border-white/10 bg-white/[0.04]"
                href={`/admin/templates/${template.template.id}/layout`}
              >
                <RefreshCw className="size-4" />
                Edit layout
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <aside className="panel-glow rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Asset summary
          </p>
          <div className="mt-4 space-y-3">
            <InfoRow label="Active" value={template.template.is_active ? "Yes" : "No"} />
            <InfoRow label="Source" value={template.template.source_kind.toUpperCase()} />
            <InfoRow label="Layout" value={template.template.has_layout ? "Ready" : "Missing"} />
            <InfoRow
              label="Created"
              value={new Date(template.template.created_at).toLocaleString()}
            />
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/62">
            Use the layout editor to position the name, then render a PDF preview before you enable
            issuance.
          </div>
        </aside>
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-white/58">{label}</span>
      <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-primary">
        {value}
      </span>
    </div>
  );
}
