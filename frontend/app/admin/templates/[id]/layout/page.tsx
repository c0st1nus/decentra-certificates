"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
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
    <section className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 py-1">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-sm text-white/80 backdrop-blur-xl transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          href={`/admin/templates/${template.template.id}`}
        >
          <ArrowLeft className="size-4" />
          Back to template
        </Link>
      </div>

      <div className="min-h-0 flex-1">
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
      </div>
    </section>
  );
}
