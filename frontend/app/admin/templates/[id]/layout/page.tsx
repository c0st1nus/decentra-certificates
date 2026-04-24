"use client";

import { LoaderCircle } from "lucide-react";
import { use, useEffect, useState } from "react";

import { TemplateLayoutEditor } from "@/components/template-layout-editor";
import { Skeleton } from "@/components/ui/skeleton";
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
        if (!isMounted) return;
        setTemplate(data);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas">
        <LoaderCircle className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas text-sm text-white/70">
        Template not found.
      </div>
    );
  }

  return (
    <TemplateLayoutEditor
      showHeader={false}
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
  );
}
