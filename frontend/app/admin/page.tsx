"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { TemplateCard } from "@/components/template-card";
import { Skeleton } from "@/components/ui/skeleton";
import { type TemplateDetail, deleteTemplate, fetchTemplates } from "@/lib/admin-api";

export default function AdminPage() {
  const [templates, setTemplates] = useState<TemplateDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const { data } = await fetchTemplates();
        if (!isMounted) return;
        setTemplates(data ?? []);
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
  }, []);

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this template?");
    if (!confirmed) return;

    try {
      const { response } = await deleteTemplate(id);
      if (!response.ok) return;
      setTemplates((current) => current.filter((t) => t.template.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-hero text-gradient text-left">Templates</h1>
        <Link
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 transition hover:border-primary/30 hover:text-white"
          href="/admin/templates"
        >
          <Plus className="size-4" />
          Upload template
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      ) : templates.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard key={template.template.id} template={template} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-panel/90 p-10 text-center backdrop-blur-xl">
          <p className="text-sm text-white/70">No templates uploaded yet.</p>
          <Link
            className="btn-hero glow-primary rounded-2xl bg-white/[0.05]"
            href="/admin/templates"
          >
            <Plus className="size-4" />
            Upload first template
          </Link>
        </div>
      )}
    </section>
  );
}
