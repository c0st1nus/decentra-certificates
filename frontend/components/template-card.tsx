"use client";

import { FileText, LoaderCircle, Tags, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { type TemplateDetail, fetchTemplateSource } from "@/lib/admin-api";
import { cn, formatCompactNumber, formatDate } from "@/lib/utils";

type TemplateCardProps = {
  template: TemplateDetail;
  onDelete?: (id: string) => void;
};

function TemplateThumbnail({
  sourceKind,
  templateId,
}: {
  sourceKind: string;
  templateId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      try {
        const response = await fetchTemplateSource(templateId);
        if (!response.ok) {
          if (!cancelled) setIsLoading(false);
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setUrl(objectUrl);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [templateId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  const isPdf = sourceKind.toLowerCase() === "pdf";

  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-white/30">
        <FileText className="size-8" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          {sourceKind.toUpperCase()}
        </span>
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-white/30">
        <FileText className="size-10 text-primary/60" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">PDF</span>
      </div>
    );
  }

  return <img alt="Превью шаблона" className="h-full w-full object-cover" src={url} />;
}

export function TemplateCard({ template, onDelete }: TemplateCardProps) {
  const t = template.template;

  return (
    <div className="group relative rounded-2xl border border-white/10 bg-panel/90 p-4 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/30">
      <Link className="block" href={`/admin/templates/${t.id}`}>
        <div className="relative h-32 w-full overflow-hidden rounded-xl border border-white/10 bg-black/20">
          <TemplateThumbnail sourceKind={t.source_kind} templateId={t.id} />
        </div>

        <div className="mt-3 flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-white truncate">{t.name}</h3>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              t.is_active
                ? "border border-primary/25 bg-primary/10 text-primary"
                : "border border-white/10 bg-white/[0.04] text-white/50",
            )}
          >
            {t.is_active ? "Активен" : "Черновик"}
          </span>
        </div>

        <p className="mt-1 text-xs text-white/50">{formatDate(t.updated_at)}</p>

        <p className="mt-2 flex items-center gap-3 text-xs text-white/65">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" />
            {formatCompactNumber(t.participant_count)} участников
          </span>
          <span className="inline-flex items-center gap-1">
            <Tags className="size-3" />
            {t.category_count} категорий
          </span>
        </p>
      </Link>

      {onDelete && (
        <button
          className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/40 p-1.5 text-white/50 opacity-0 transition hover:border-red-500/30 hover:text-red-400 group-hover:opacity-100"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(t.id);
          }}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
