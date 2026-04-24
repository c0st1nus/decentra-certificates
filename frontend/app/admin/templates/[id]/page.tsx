"use client";

import {
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

import { AdminPageHeader } from "@/components/admin-page-header";
import { AdminPanel } from "@/components/admin-panel";
import { TemplateAssetPreview } from "@/components/template-asset-preview";
import { TemplateStatLinkCard } from "@/components/template-stat-link-card";
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
      <AdminPanel as="section" className="text-sm text-white/70">
        Template not found.
      </AdminPanel>
    );
  }

  const t = template.template;

  return (
    <section className="space-y-6">
      <AdminPageHeader
        description="Manage template: source file, layout, categories, participants and certificate issuance."
        title={t.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TemplateStatLinkCard
          count={formatCompactNumber(t.participant_count)}
          href={`/admin/templates/${id}/participants`}
          icon={Users}
          label="Participants"
          subtitle="Manage roster"
        />

        <TemplateStatLinkCard
          count={formatCompactNumber(t.category_count)}
          href={`/admin/templates/${id}/categories`}
          icon={Tags}
          label="Categories"
          subtitle="Template categories"
        />
      </div>

      <AdminPanel>
        <div className="grid gap-4">
          <label className="block text-sm font-medium text-white/80" htmlFor="template-name">
            Template name
            <input
              id="template-name"
              className="admin-input mt-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-white/80" htmlFor="template-file">
            Replace source file
            <input
              id="template-file"
              className="admin-file-input mt-2 block rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4"
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
      </AdminPanel>

      <div className="space-y-3">
        <p className="admin-eyebrow">Source preview</p>
        <TemplateAssetPreview sourceKind={t.source_kind} templateId={t.id} templateName={t.name} />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="admin-muted-pill">
          <Users className="size-3 text-primary/70" />
          {formatCompactNumber(t.participant_count)} participants
        </span>
        <span className="admin-muted-pill">
          <Tags className="size-3 text-primary/70" />
          {t.category_count} categories
        </span>
        <span className="admin-muted-pill">{t.source_kind.toUpperCase()}</span>
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
