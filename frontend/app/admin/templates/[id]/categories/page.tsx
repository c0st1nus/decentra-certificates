"use client";

import { ArrowLeft, CheckCircle2, PencilLine, Plus, Tags, Trash2 } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

import {
  type CategorySummary,
  type TemplateDetail,
  createTemplateCategory,
  deleteTemplateCategory,
  fetchTemplate,
  fetchTemplateCategories,
  updateTemplateCategory,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

type FormState = {
  description: string;
  isActive: boolean;
  name: string;
};

const INITIAL_FORM: FormState = {
  description: "",
  isActive: true,
  name: "",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default function TemplateCategoriesPage({ params }: Props) {
  const { id } = use(params);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [tplRes, catRes] = await Promise.all([
          fetchTemplate(id),
          fetchTemplateCategories(id),
        ]);
        if (!isMounted) return;
        setTemplate(tplRes.data ?? null);
        setCategories(catRes.data ?? []);
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

  if (isLoading || !template) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65 backdrop-blur-xl">
        Loading categories...
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <Link
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition"
          href={`/admin/templates/${id}`}
        >
          <ArrowLeft className="size-4" />
          Back to template
        </Link>

        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <Tags className="size-4 text-primary" />
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Categories
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">{template.template.name}</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Категории для этого шаблона. Добавляйте, редактируйте и удаляйте.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <CategoryForm
          templateId={id}
          onCreated={(category) => {
            setCategories((current) => [...current, category]);
          }}
        />

        <div className="space-y-3">
          {categories.length === 0 ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-8 text-center">
              <CheckCircle2 className="mx-auto size-10 text-primary/80" />
              <h3 className="mt-4 text-lg font-black text-white">
                В этом шаблоне пока нет категорий
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">
                Добавьте категории через форму слева.
              </p>
            </div>
          ) : (
            categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onUpdate={(updated) => {
                  setCategories((current) =>
                    current.map((c) => (c.id === updated.id ? updated : c)),
                  );
                }}
                onDelete={(categoryId) => {
                  setCategories((current) => current.filter((c) => c.id !== categoryId));
                }}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function CategoryForm({
  templateId,
  onCreated,
}: {
  templateId: string;
  onCreated: (category: CategorySummary) => void;
}) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("Заполните название и добавьте категорию.");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMessage("Название категории обязательно.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.isActive,
      };
      const { response, data } = await createTemplateCategory(templateId, payload);
      if (!response.ok || !data) {
        setMessage("Не удалось создать категорию.");
        return;
      }
      onCreated(data);
      setMessage(`Категория ${data.name} добавлена.`);
      setForm(INITIAL_FORM);
    } catch {
      setMessage("Операция не удалась. Попробуйте ещё раз.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
        Add category
      </p>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-white/72" htmlFor="cat-name">
          Название
          <input
            id="cat-name"
            autoComplete="off"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
            disabled={isSaving}
            spellCheck={false}
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>

        <label className="block text-sm font-medium text-white/72" htmlFor="cat-desc">
          Описание
          <textarea
            id="cat-desc"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
            disabled={isSaving}
            placeholder="Например: кейс для финалистов"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>

        <label className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/78">
          <span>
            <span className="block font-medium text-white">Активная</span>
            <span className="mt-1 block text-xs leading-5 text-white/50">
              Неактивная останется в истории, но пропадёт из активного набора.
            </span>
          </span>
          <input
            checked={form.isActive}
            className="size-4 accent-primary"
            disabled={isSaving}
            type="checkbox"
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
        </label>

        <button className="btn-hero glow-primary rounded-2xl bg-white/[0.05]" type="submit">
          <Plus className="size-4" />
          Add category
        </button>
      </form>

      <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/65">
        {message}
      </div>
    </div>
  );
}

function CategoryCard({
  category,
  onUpdate,
  onDelete,
}: {
  category: CategorySummary;
  onUpdate: (updated: CategorySummary) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");
  const [isActive, setIsActive] = useState(category.is_active);
  const [isSaving, setIsSaving] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        is_active: isActive,
      };
      const { response, data } = await updateTemplateCategory(
        category.template_id,
        category.id,
        payload,
      );
      if (!response.ok || !data) return;
      onUpdate(data);
      setEditing(false);
    } catch {
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!armedDelete) {
      setArmedDelete(true);
      return;
    }
    const { response } = await deleteTemplateCategory(category.template_id, category.id);
    if (response.ok) {
      onDelete(category.id);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <input
                className="rounded-xl border border-white/10 bg-black/35 px-3 py-1.5 text-lg font-black text-white outline-none focus:border-primary/60"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            ) : (
              <h3 className="text-lg font-black text-white">{category.name}</h3>
            )}
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[10px] font-pixel uppercase tracking-[0.18em]",
                category.is_active
                  ? "border border-primary/25 bg-primary/10 text-primary"
                  : "border border-white/10 bg-white/[0.04] text-white/55",
              )}
            >
              {category.is_active ? "Active" : "Archived"}
            </span>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">slug: {category.slug}</p>
          {editing ? (
            <textarea
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white/72 outline-none focus:border-primary/60"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          ) : (
            <p className="text-sm leading-6 text-white/62">
              {category.description ?? "Описание не добавлено."}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                className="btn-hero glow-primary rounded-2xl bg-white/[0.05] disabled:opacity-50"
                disabled={isSaving}
                type="button"
                onClick={() => void handleSave()}
              >
                Save
              </button>
              <button
                className="btn-hero rounded-2xl border border-white/10 bg-white/[0.04] text-white/80"
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(category.name);
                  setDescription(category.description ?? "");
                  setIsActive(category.is_active);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn-hero rounded-2xl border border-white/10 bg-white/[0.04] text-white/80"
              type="button"
              onClick={() => setEditing(true)}
            >
              <PencilLine className="size-4" />
              Edit
            </button>
          )}
          <button
            className={cn(
              "btn-hero rounded-2xl border text-white",
              armedDelete
                ? "border-red-400/40 bg-red-500/20"
                : "border-red-500/20 bg-red-500/10 text-red-100",
            )}
            type="button"
            onClick={() => void handleDelete()}
          >
            <Trash2 className="size-4" />
            {armedDelete ? "Confirm" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
