"use client";

import {
  Check,
  CheckCircle2,
  Circle,
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
      toast.error("Введите название шаблона.");
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
        toast.error("Не удалось сохранить шаблон. Проверьте данные и попробуйте ещё раз.");
        setIsSaving(false);
        return;
      }

      setTemplate(data);
      setName(data.template.name);
      setFile(null);
      toast.success("Шаблон сохранён.");
    } catch {
      toast.error("Не удалось сохранить шаблон.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!template) return;

    const activationBlocker = getActivationBlocker(template, name);
    if (!template.template.is_active && activationBlocker) {
      toast.error(`Активация невозможна: ${activationBlocker}.`);
      return;
    }

    setIsTogglingActive(true);

    try {
      if (template.template.is_active) {
        const { response, data } = await deactivateTemplate(id);
        if (response.ok && data) {
          setTemplate(data);
          toast.success("Шаблон деактивирован.");
        } else {
          toast.error("Не удалось деактивировать шаблон.");
        }
      } else {
        const { response, data } = await activateTemplate(id);
        if (response.ok && data) {
          setTemplate(data);
          toast.success("Шаблон активирован.");
        } else {
          toast.error("Активация невозможна: проверьте макет, категории и участников.");
        }
      }
    } catch {
      toast.error("Не удалось изменить статус шаблона.");
    } finally {
      setIsTogglingActive(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Удалить этот шаблон? Настройки макета, категории и связанные данные этого шаблона будут удалены.",
      )
    ) {
      return;
    }

    try {
      const { response } = await deleteTemplate(id);
      if (response.ok) {
        toast.success("Шаблон удалён.");
        router.replace("/admin/templates");
      } else {
        toast.error("Не удалось удалить шаблон.");
      }
    } catch {
      toast.error("Не удалось удалить шаблон.");
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
        Шаблон не найден.
      </AdminPanel>
    );
  }

  const t = template.template;

  return (
    <section className="space-y-6">
      <AdminPageHeader
        description="Проверьте готовность шаблона, настройте макет, категории и список участников."
        title={t.name}
      />

      <AdminPanel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="admin-eyebrow">Готовность</p>
            <h2 className="mt-3 text-2xl font-black text-white">Что нужно для запуска</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Сначала настройте макет, затем проверьте категории и участников. Активируйте шаблон,
              когда всё готово.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              t.has_layout && t.category_count > 0 && t.participant_count > 0 && t.is_active
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-amber-500/20 bg-amber-500/10 text-amber-200",
            )}
          >
            {t.has_layout && t.category_count > 0 && t.participant_count > 0 && t.is_active
              ? "Готов к работе"
              : "Нужна настройка"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <ReadinessItem done label="Файл шаблона загружен" />
          <ReadinessItem
            done={t.has_layout}
            href={`/admin/templates/${id}/layout`}
            label="Макет настроен"
          />
          <ReadinessItem
            done={t.category_count > 0}
            href={`/admin/templates/${id}/categories`}
            label="Категории добавлены"
          />
          <ReadinessItem
            done={t.participant_count > 0}
            href={`/admin/templates/${id}/participants`}
            label="Участники загружены"
          />
        </div>
      </AdminPanel>

      <div className="grid gap-4 sm:grid-cols-2">
        <TemplateStatLinkCard
          count={formatCompactNumber(t.participant_count)}
          href={`/admin/templates/${id}/participants`}
          icon={Users}
          label="Участники"
          subtitle="Загрузка и правка списка"
        />

        <TemplateStatLinkCard
          count={formatCompactNumber(t.category_count)}
          href={`/admin/templates/${id}/categories`}
          icon={Tags}
          label="Категории"
          subtitle="Треки и типы сертификатов"
        />
      </div>

      <AdminPanel>
        <div className="grid gap-4">
          <label className="block text-sm font-medium text-white/80" htmlFor="template-name">
            Название шаблона
            <input
              id="template-name"
              className="admin-input mt-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-white/80" htmlFor="template-file">
            Заменить файл сертификата
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
              ? `Выбран файл: ${file.name}. Сохраните изменения, чтобы обновить превью ниже.`
              : "Если заменить файл, сначала сохраните изменения. Превью ниже показывает уже сохранённый файл, а не локальный черновик."}
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
                  Сохраняем
                </>
              ) : (
                <>
                  <PencilLine className="size-4" />
                  Сохранить
                </>
              )}
            </button>

            <Link
              className="btn-hero rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-100"
              href={`/admin/templates/${t.id}/layout`}
            >
              <ScanLine className="size-4" />
              Редактор макета
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
                  Активен
                </>
              ) : (
                <>
                  <Power className="size-4" />
                  Активировать
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
        <p className="admin-eyebrow">Превью файла</p>
        <TemplateAssetPreview sourceKind={t.source_kind} templateId={t.id} templateName={t.name} />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="admin-muted-pill">
          <Users className="size-3 text-primary/70" />
          {formatCompactNumber(t.participant_count)} участников
        </span>
        <span className="admin-muted-pill">
          <Tags className="size-3 text-primary/70" />
          {t.category_count} категорий
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
          {t.has_layout ? "Макет настроен" : "Макет не настроен"}
        </span>
      </div>
    </section>
  );
}

function getActivationBlocker(template: TemplateDetail, draftName: string) {
  const t = template.template;
  if (!draftName.trim()) {
    return "укажите название шаблона и сохраните изменения";
  }
  if (!t.has_layout) {
    return "сначала настройте макет шаблона";
  }
  if (t.category_count === 0) {
    return "сначала добавьте хотя бы одну категорию";
  }
  if (t.participant_count === 0) {
    return "сначала загрузите участников";
  }

  return null;
}

function ReadinessItem({ done, href, label }: { done: boolean; href?: string; label: string }) {
  const Icon = done ? CheckCircle2 : Circle;
  const content = (
    <div
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
        done
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-white/10 bg-white/[0.03] text-white/70",
        href && "hover:border-primary/30 hover:bg-white/[0.05]",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="font-medium">{label}</span>
    </div>
  );

  return href ? (
    <Link
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      href={href}
    >
      {content}
    </Link>
  ) : (
    content
  );
}
