"use client";

import {
  ArrowRight,
  Layers3,
  LoaderCircle,
  PencilLine,
  ScanLine,
  Tags,
  ToggleRight,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { TemplateAssetPreview } from "@/components/template-asset-preview";
import {
  type IssuanceStatusResponse,
  type TemplateDetail,
  activateTemplate,
  deleteTemplate,
  fetchIssuanceStatus,
  fetchTemplate,
  updateIssuanceStatus,
  updateTemplate,
} from "@/lib/admin-api";

type Props = {
  params: Promise<{ id: string }>;
};

export default function TemplateDetailPage({ params }: Props) {
  const router = useRouter();
  const { id } = use(params);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [issuance, setIssuance] = useState<IssuanceStatusResponse | null>(null);
  const [issuanceLoading, setIssuanceLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [templateResponse, issuanceResponse] = await Promise.all([
        fetchTemplate(id),
        fetchIssuanceStatus(),
      ]);
      if (!isMounted) {
        return;
      }

      if (templateResponse.data) {
        setTemplate(templateResponse.data);
        setName(templateResponse.data.template.name);
      }
      if (issuanceResponse.data) {
        setIssuance(issuanceResponse.data);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  async function handleSave() {
    if (!name.trim()) {
      return;
    }

    const form = new FormData();
    form.append("name", name.trim());
    if (file) {
      form.append("file", file);
    }

    setIsSaving(true);

    try {
      const { response, data } = await updateTemplate(id, form);
      if (!response.ok || !data) {
        setIsSaving(false);
        return;
      }

      setTemplate(data);
      setName(data.template.name);
      setFile(null);
    } catch {
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivate() {
    const { data } = await activateTemplate(id);
    if (data) {
      setTemplate(data);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this template?")) {
      return;
    }

    const { response } = await deleteTemplate(id);
    if (response.ok) {
      router.replace("/admin/templates");
    }
  }

  async function toggleIssuance() {
    if (!issuance) return;
    setIssuanceLoading(true);
    try {
      const { data } = await updateIssuanceStatus(!issuance.enabled);
      if (data) setIssuance(data);
    } catch {
    } finally {
      setIssuanceLoading(false);
    }
  }

  if (!template) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65 backdrop-blur-xl">
        Loading template...
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <Layers3 className="size-4 text-primary" />
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Template workspace
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">{template.template.name}</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Управление шаблоном: исходник, layout, категории, участники и выдача сертификатов.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          className="group flex flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white/[0.04]"
          href={`/admin/templates/${id}/participants`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
              <Users className="size-4 text-primary" />
            </div>
            <div>
              <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Participants
              </p>
              <p className="text-sm font-medium text-white/80">Управление списком</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-white">
              {formatCount(template.template.participant_count)}
            </span>
            <ArrowRight className="size-5 text-primary/85 transition group-hover:translate-x-0.5" />
          </div>
        </Link>

        <Link
          className="group flex flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white/[0.04]"
          href={`/admin/templates/${id}/categories`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
              <Tags className="size-4 text-primary" />
            </div>
            <div>
              <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Categories
              </p>
              <p className="text-sm font-medium text-white/80">Категории шаблона</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-white">
              {formatCount(template.template.category_count)}
            </span>
            <ArrowRight className="size-5 text-primary/85 transition group-hover:translate-x-0.5" />
          </div>
        </Link>

        <div className="flex flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
              <ToggleRight className="size-4 text-primary" />
            </div>
            <div>
              <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Issuance
              </p>
              <p className="text-sm font-medium text-white/80">Публичная выдача</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">
              {issuance?.enabled ? "Enabled" : "Disabled"}
            </span>
            <button
              className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary transition hover:border-primary/40 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={issuanceLoading || (!issuance?.enabled && !issuance?.ready_to_enable)}
              type="button"
              onClick={() => void toggleIssuance()}
            >
              {issuanceLoading ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : issuance?.enabled ? (
                "Disable"
              ) : (
                "Enable"
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
          <div className="grid gap-4">
            <label className="block text-sm font-medium text-white/72" htmlFor="template-name">
              Template name
              <input
                id="template-name"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-white/72" htmlFor="template-file">
              Replace source file
              <input
                id="template-file"
                className="mt-2 block w-full rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4 text-sm text-white/72 file:mr-4 file:rounded-full file:border-0 file:bg-primary/15 file:px-4 file:py-2 file:text-xs file:font-pixel file:uppercase file:tracking-[0.18em] file:text-primary hover:file:bg-primary/20"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/62">
              {file
                ? `Selected file: ${file.name}. Save changes to persist it and refresh the source preview below.`
                : "Если меняете исходный файл, сначала сохраните его здесь. Ниже всегда показывается уже сохранённый ассет, а не локальный draft."}
            </div>

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
              <Link
                className="btn-hero rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-100"
                href={`/admin/templates/${template.template.id}/layout`}
              >
                <ScanLine className="size-4" />
                Open canvas editor
              </Link>
              <button
                className="btn-hero rounded-2xl border border-red-500/20 bg-red-500/10 text-red-100"
                type="button"
                onClick={() => void handleDelete()}
              >
                Delete
              </button>
            </div>

            <div className="section-divider mt-2" />

            <div className="space-y-3">
              <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Source preview
              </p>
              <TemplateAssetPreview
                sourceKind={template.template.source_kind}
                templateId={template.template.id}
                templateName={template.template.name}
              />
            </div>
          </div>
        </div>

        <aside className="panel-glow rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Asset summary
          </p>
          <div className="mt-4 space-y-3">
            <InfoRow label="Active" value={template.template.is_active ? "Yes" : "No"} />
            <InfoRow label="Categories" value={String(template.template.category_count)} />
            <InfoRow
              label="Participants"
              value={formatCount(template.template.participant_count)}
            />
            <InfoRow label="Issued" value={formatCount(template.template.issued_count)} />
            <InfoRow label="Source" value={template.template.source_kind.toUpperCase()} />
            <InfoRow label="Layout" value={template.template.has_layout ? "Ready" : "Missing"} />
            <InfoRow
              label="Updated"
              value={new Date(template.template.updated_at).toLocaleString()}
            />
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/62">
            Здесь живёт всё, что относится именно к этому шаблону: исходник, layout, локальные
            категории и список участников, привязанный к его event-коду.
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

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}
