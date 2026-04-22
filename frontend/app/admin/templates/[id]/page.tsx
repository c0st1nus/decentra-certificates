"use client";

import {
  ArrowRight,
  Check,
  LoaderCircle,
  PencilLine,
  Power,
  ScanLine,
  Tags,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { TemplateAssetPreview } from "@/components/template-asset-preview";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type TemplateDetail,
  activateTemplate,
  deactivateTemplate,
  deleteTemplate,
  fetchTemplate,
  updateTemplate,
} from "@/lib/admin-api";
import { cn, formatCompactNumber } from "@/lib/utils";

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
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const { data } = await fetchTemplate(id);
        if (!isMounted) return;

        if (data) {
          setTemplate(data);
          setName(data.template.name);
        }
      } catch {
        if (!isMounted) return;
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Template name is required.");
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
        toast.error("Failed to save template.");
        setIsSaving(false);
        return;
      }

      setTemplate(data);
      setName(data.template.name);
      setFile(null);
      toast.success("Template updated.");
    } catch {
      toast.error("Failed to save template.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!template) return;
    setIsTogglingActive(true);

    try {
      if (template.template.is_active) {
        const { data } = await deactivateTemplate(id);
        if (data) {
          setTemplate(data);
          toast.success("Template deactivated.");
        }
      } else {
        const { data } = await activateTemplate(id);
        if (data) {
          setTemplate(data);
          toast.success("Template activated.");
        }
      }
    } catch {
      toast.error("Failed to update template status.");
    } finally {
      setIsTogglingActive(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this template?")) {
      return;
    }

    try {
      const { response } = await deleteTemplate(id);
      if (response.ok) {
        toast.success("Template deleted.");
        router.replace("/admin/templates");
      } else {
        toast.error("Failed to delete template.");
      }
    } catch {
      toast.error("Failed to delete template.");
    }
  }

  if (isLoading) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </section>
    );
  }

  if (!template) {
    return (
      <section className="rounded-2xl border border-white/10 bg-panel/90 p-5 text-sm text-white/70 backdrop-blur-xl">
        Template not found.
      </section>
    );
  }

  const t = template.template;

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <h1 className="heading-hero text-gradient text-left">{t.name}</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
          Manage template: source file, layout, categories, participants and certificate issuance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white/[0.04]"
          href={`/admin/templates/${id}/participants`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
              <Users className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
                Participants
              </p>
              <p className="text-sm font-medium text-white/85">Manage roster</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-white">
              {formatCompactNumber(t.participant_count)}
            </span>
            <ArrowRight className="size-5 text-primary/85 transition group-hover:translate-x-0.5" />
          </div>
        </Link>

        <Link
          className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white/[0.04]"
          href={`/admin/templates/${id}/categories`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
              <Tags className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
                Categories
              </p>
              <p className="text-sm font-medium text-white/85">Template categories</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-white">
              {formatCompactNumber(t.category_count)}
            </span>
            <ArrowRight className="size-5 text-primary/85 transition group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
        <div className="grid gap-4">
          <label className="block text-sm font-medium text-white/80" htmlFor="template-name">
            Template name
            <input
              id="template-name"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-white/80" htmlFor="template-file">
            Replace source file
            <input
              id="template-file"
              className="mt-2 block w-full rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4 text-sm text-white/75 file:mr-4 file:rounded-full file:border-0 file:bg-primary/15 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.18em] file:text-primary hover:file:bg-primary/20"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/65">
            {file
              ? `Selected file: ${file.name}. Save changes to persist it and refresh the source preview below.`
              : "If you change the source file, save it here first. The preview below always shows the already saved asset, not a local draft."}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-hero glow-primary rounded-2xl bg-white/[0.05]"
              disabled={isSaving}
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
                  Save
                </>
              )}
            </button>

            <Link
              className="btn-hero rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-100"
              href={`/admin/templates/${t.id}/layout`}
            >
              <ScanLine className="size-4" />
              Editor
            </Link>

            <button
              className={cn(
                "btn-hero rounded-2xl border transition disabled:cursor-not-allowed disabled:opacity-50",
                t.is_active
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-white/10 bg-white/[0.04] text-white/75 hover:border-primary/30 hover:text-white",
              )}
              disabled={isTogglingActive}
              type="button"
              onClick={() => void handleToggleActive()}
            >
              {isTogglingActive ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : t.is_active ? (
                <>
                  <Check className="size-4" />
                  Active
                </>
              ) : (
                <>
                  <Power className="size-4" />
                  Activate
                </>
              )}
            </button>

            <button
              className="btn-hero ml-auto rounded-2xl border border-red-500/20 bg-red-500/10 text-red-100"
              type="button"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
          Source preview
        </p>
        <TemplateAssetPreview sourceKind={t.source_kind} templateId={t.id} templateName={t.name} />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65">
          <Users className="size-3 text-primary/70" />
          {formatCompactNumber(t.participant_count)} participants
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65">
          <Tags className="size-3 text-primary/70" />
          {t.category_count} categories
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65">
          {t.source_kind.toUpperCase()}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
            t.has_layout
              ? "border-primary/20 bg-primary/5 text-primary/80"
              : "border-amber-500/20 bg-amber-500/5 text-amber-400/80",
          )}
        >
          {t.has_layout ? "Layout ready" : "Layout missing"}
        </span>
      </div>
    </section>
  );
}
