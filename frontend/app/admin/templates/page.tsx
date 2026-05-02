"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin-page-header";
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
    const confirmed = window.confirm(
      "Удалить шаблон? Вместе с ним будут удалены настройки макета, категории и связанные данные этого шаблона.",
    );
    if (!confirmed) return;

    try {
      const { response } = await deleteTemplate(id);
      if (!response.ok) {
        toast.error("Не удалось удалить шаблон.");
        return;
      }
      setTemplates((current) => current.filter((t) => t.template.id !== id));
      toast.success("Шаблон удалён.");
    } catch {
      toast.error("Не удалось удалить шаблон.");
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        description="Загрузите файл сертификата, настройте область ФИО, затем добавьте категории и участников."
        title="Шаблоны сертификатов"
      />

      <TemplateUploadForm
        onSaved={(template) => {
          setTemplates((current) => [template, ...current]);
          toast.success("Шаблон загружен. Теперь настройте макет сертификата.");
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
          <div className="admin-panel p-8 text-center">
            <h2 className="text-lg font-black text-white">Шаблонов пока нет</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/65">
              Загрузите первый файл сертификата выше. После этого можно будет настроить макет и
              импортировать участников.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
