"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { TemplateCard } from "@/components/template-card";
import { TemplateUploadForm } from "@/components/template-upload-form";
import { Skeleton } from "@/components/ui/skeleton";
import { type TemplateDetail, deleteTemplate, fetchTemplates } from "@/lib/admin-api";

export default function AdminTemplatesPage() {
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
      if (!response.ok) {
        toast.error("Failed to delete template.");
        return;
      }
      setTemplates((current) => current.filter((t) => t.template.id !== id));
      toast.success("Template deleted.");
    } catch {
      toast.error("Failed to delete template.");
    }
  }

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <h1 className="heading-hero text-gradient text-left">Certificate templates</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
          Upload template files, configure layout and manage variants.
        </p>
      </div>

      <TemplateUploadForm
        onSaved={(template) => {
          setTemplates((current) => [template, ...current]);
          toast.success("Template uploaded.");
        }}
      />

      <div>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
        ) : templates.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <TemplateCard
                key={template.template.id}
                template={template}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-panel/90 p-5 text-sm text-white/70">
            No templates uploaded yet.
          </div>
        )}
      </div>
    </section>
  );
}
