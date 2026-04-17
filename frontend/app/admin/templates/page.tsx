"use client";

import { Activity, ArrowRight, Layers3, ScanLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { TemplateUploadForm } from "@/components/template-upload-form";
import {
  type TemplateDetail,
  activateTemplate,
  deleteTemplate,
  fetchTemplates,
} from "@/lib/admin-api";

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const { data } = await fetchTemplates();
        if (!isMounted) {
          return;
        }
        setTemplates(data ?? []);
      } catch {
        if (!isMounted) {
          return;
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleActivate(id: string) {
    const { data } = await activateTemplate(id);
    if (!data) {
      return;
    }
    setTemplates((current) =>
      current.map((template) => ({
        ...template,
        template: {
          ...template.template,
          is_active: template.template.id === id,
        },
      })),
    );
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this template?");
    if (!confirmed) {
      return;
    }

    const { response } = await deleteTemplate(id);
    if (!response.ok) {
      return;
    }

    setTemplates((current) => current.filter((template) => template.template.id !== id));
  }

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <Layers3 className="size-4 text-primary" />
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Templates
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">Шаблоны сертификатов.</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Загрузите файл шаблона, настройте layout и выберите активный вариант для публичной выдачи.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <TemplateUploadForm
          onSaved={(template) => {
            setTemplates((current) => [template, ...current]);
          }}
        />

        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65">
              Loading template list...
            </div>
          ) : templates.length ? (
            templates.map((template) => (
              <TemplateCard
                key={template.template.id}
                template={template}
                onActivate={handleActivate}
                onDelete={handleDelete}
              />
            ))
          ) : (
            <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65">
              No templates uploaded yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TemplateCard({
  template,
  onActivate,
  onDelete,
}: {
  template: TemplateDetail;
  onActivate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black text-white">{template.template.name}</h3>
            {template.template.is_active ? (
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-pixel uppercase tracking-[0.18em] text-primary">
                Active
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-white/62">
            {template.template.source_kind.toUpperCase()} asset · layout{" "}
            {template.template.has_layout ? "ready" : "missing"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/72 transition hover:border-primary/30 hover:text-white"
            href={`/admin/templates/${template.template.id}`}
          >
            <Activity className="size-3.5" />
            Template
            <ArrowRight className="size-3.5" />
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/15"
            href={`/admin/templates/${template.template.id}/layout`}
          >
            <ScanLine className="size-3.5" />
            Editor
          </Link>
          {!template.template.is_active ? (
            <button
              className="rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary transition hover:border-primary/40 hover:bg-primary/15"
              type="button"
              onClick={() => void onActivate(template.template.id)}
            >
              Activate
            </button>
          ) : null}
          <button
            className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:border-red-400/30 hover:bg-red-500/15"
            type="button"
            onClick={() => void onDelete(template.template.id)}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
