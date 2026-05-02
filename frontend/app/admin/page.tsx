"use client";

import { CheckCircle2, Circle, FileUp, Plus, ScanLine, Tags, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin-panel";
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

  const activeTemplate = templates.find((item) => item.template.is_active)?.template ?? null;
  const hasTemplate = templates.length > 0;
  const hasLayout = templates.some((item) => item.template.has_layout);
  const hasParticipants = templates.some((item) => item.template.participant_count > 0);
  const hasCategories = templates.some((item) => item.template.category_count > 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="heading-hero text-gradient text-left">Панель запуска</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
            Здесь видно, готова ли система к выдаче сертификатов и какой следующий шаг нужно
            сделать.
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 transition hover:border-primary/30 hover:text-white"
          href="/admin/templates"
        >
          <Plus className="size-4" />
          Загрузить шаблон
        </Link>
      </div>

      <AdminPanel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="admin-eyebrow">Что делать дальше</p>
            <h2 className="mt-3 text-2xl font-black text-white">Путь до выдачи сертификатов</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Проходите шаги сверху вниз. Готовые пункты отмечаются автоматически по данным системы.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
            {activeTemplate
              ? `Активный шаблон: ${activeTemplate.name}`
              : "Активный шаблон не выбран"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <WorkflowStep
            done={hasTemplate}
            href="/admin/templates"
            icon={FileUp}
            label="Загрузить шаблон"
          />
          <WorkflowStep
            done={hasLayout}
            href={
              activeTemplate ? `/admin/templates/${activeTemplate.id}/layout` : "/admin/templates"
            }
            icon={ScanLine}
            label="Настроить макет"
          />
          <WorkflowStep
            done={hasCategories}
            href={
              activeTemplate
                ? `/admin/templates/${activeTemplate.id}/categories`
                : "/admin/templates"
            }
            icon={Tags}
            label="Добавить категории"
          />
          <WorkflowStep
            done={hasParticipants}
            href={
              activeTemplate
                ? `/admin/templates/${activeTemplate.id}/participants`
                : "/admin/templates"
            }
            icon={Users}
            label="Загрузить участников"
          />
          <WorkflowStep
            done={Boolean(activeTemplate)}
            href="/admin/templates"
            icon={CheckCircle2}
            label="Активировать"
          />
        </div>
      </AdminPanel>

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
        <AdminPanel className="flex flex-col items-center justify-center gap-4 p-10 text-center">
          <h2 className="text-xl font-black text-white">Шаблонов пока нет</h2>
          <p className="max-w-md text-sm leading-6 text-white/65">
            Начните с загрузки PNG, JPG или PDF сертификата. После загрузки появится редактор макета
            и раздел участников.
          </p>
          <Link
            className="btn-hero glow-primary rounded-2xl bg-white/[0.05]"
            href="/admin/templates"
          >
            <Plus className="size-4" />
            Загрузить первый шаблон
          </Link>
        </AdminPanel>
      )}
    </section>
  );
}

function WorkflowStep({
  done,
  href,
  icon: Icon,
  label,
}: {
  done: boolean;
  href: string;
  icon: typeof FileUp;
  label: string;
}) {
  const StatusIcon = done ? CheckCircle2 : Circle;

  return (
    <Link
      className="group rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-primary/30 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      href={href}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <Icon className="size-4 text-primary" />
        </span>
        <StatusIcon className={done ? "size-4 text-primary" : "size-4 text-white/35"} />
      </div>
      <p className="mt-3 text-sm font-semibold leading-5 text-white">{label}</p>
      <p className="mt-1 text-xs text-white/50">{done ? "Готово" : "Требует действия"}</p>
    </Link>
  );
}
