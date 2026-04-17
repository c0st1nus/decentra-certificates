"use client";

import { ArrowLeft, LoaderCircle, ScanLine } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { TemplateLayoutEditor } from "@/components/template-layout-editor";
import type { TemplateDetail } from "@/lib/admin-api";
import { fetchTemplate } from "@/lib/admin-api";

type Props = {
  params: Promise<{ id: string }>;
};

export default function TemplateLayoutPage({ params }: Props) {
  const { id } = use(params);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const { data } = await fetchTemplate(id);
        if (!isMounted) {
          return;
        }

        setTemplate(data);
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
  }, [id]);

  if (isLoading) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" />
          Loading canvas editor...
        </div>
      </section>
    );
  }

  if (!template) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65 backdrop-blur-xl">
        Template not found.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5">
            <ScanLine className="size-4 text-sky-200" />
            <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-sky-100">
              Canvas editor
            </span>
          </div>

          <h1 className="heading-hero text-gradient text-left">{template.template.name}</h1>
          <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
            Здесь только холст, source preview, live PDF preview и controls. Управление названием,
            файлом и статусом шаблона остается на странице самого шаблона.
          </p>
        </div>

        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/75 transition hover:border-primary/30 hover:text-white"
          href={`/admin/templates/${template.template.id}`}
        >
          <ArrowLeft className="size-4" />
          Back to template
        </Link>
      </div>

      <TemplateLayoutEditor
        template={template}
        onSaved={(layout) => {
          setTemplate((current) =>
            current
              ? {
                  ...current,
                  layout,
                  template: {
                    ...current.template,
                    has_layout: true,
                  },
                }
              : current,
          );
        }}
      />
    </section>
  );
}
