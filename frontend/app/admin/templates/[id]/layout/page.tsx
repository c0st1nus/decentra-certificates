"use client";

import { useEffect, useState } from "react";

import { TemplateLayoutEditor } from "@/components/template-layout-editor";
import { type TemplateDetail, fetchTemplate } from "@/lib/admin-api";

type Props = {
  params: { id: string };
};

export default function TemplateLayoutPage({ params }: Props) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [message, setMessage] = useState("Loading layout...");

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const { data } = await fetchTemplate(params.id);
      if (!isMounted) {
        return;
      }

      if (data) {
        setTemplate(data);
        setMessage("Layout ready.");
      } else {
        setMessage("Template not found.");
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [params.id]);

  if (!template) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65 backdrop-blur-xl">
        {message}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Layout editor
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">{template.template.name}</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Tune the certificate text box coordinates and preview the generated PDF with a test name.
        </p>
      </div>

      <TemplateLayoutEditor template={template} />
    </div>
  );
}
