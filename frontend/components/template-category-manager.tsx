"use client";

import { CheckCircle2, LoaderCircle, PencilLine, Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import {
  type CategorySummary,
  createTemplateCategory,
  deleteTemplateCategory,
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

type TemplateCategoryManagerProps = {
  categories: CategorySummary[];
  onChange: (categories: CategorySummary[]) => void;
  templateId: string;
};

export function TemplateCategoryManager({
  categories,
  onChange,
  templateId,
}: TemplateCategoryManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Категории живут внутри этого шаблона и описывают его локальные кейсы.",
  );

  const sortedCategories = useMemo(
    () =>
      [...categories].sort((left, right) => {
        if (left.is_active !== right.is_active) {
          return Number(right.is_active) - Number(left.is_active);
        }

        return left.name.localeCompare(right.name, "ru");
      }),
    [categories],
  );

  function resetForm() {
    setEditingId(null);
    setForm(INITIAL_FORM);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

      if (editingId) {
        const { response, data } = await updateTemplateCategory(templateId, editingId, payload);
        if (!response.ok || !data) {
          setMessage("Не удалось обновить категорию.");
          return;
        }

        onChange(categories.map((item) => (item.id === data.id ? data : item)));
        setMessage(`Категория ${data.name} обновлена.`);
      } else {
        const { response, data } = await createTemplateCategory(templateId, payload);
        if (!response.ok || !data) {
          setMessage("Не удалось создать категорию.");
          return;
        }

        onChange([...categories, data]);
        setMessage(`Категория ${data.name} добавлена в шаблон.`);
      }

      setArmedDeleteId(null);
      resetForm();
    } catch {
      setMessage("Операция не удалась. Попробуйте ещё раз.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(categoryId: string) {
    if (armedDeleteId !== categoryId) {
      setArmedDeleteId(categoryId);
      setMessage("Нажмите удаление ещё раз, чтобы убрать категорию только из этого шаблона.");
      return;
    }

    const { response } = await deleteTemplateCategory(templateId, categoryId);
    if (!response.ok) {
      setMessage("Не удалось удалить категорию.");
      return;
    }

    onChange(categories.filter((item) => item.id !== categoryId));
    setArmedDeleteId(null);
    if (editingId === categoryId) {
      resetForm();
    }
    setMessage("Категория удалена из шаблона.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
        <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
          {editingId ? "Edit category" : "Add category"}
        </p>

        <form className="mt-4 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label
            className="block text-sm font-medium text-white/72"
            htmlFor="template-category-name"
          >
            Название
            <input
              id="template-category-name"
              autoComplete="off"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
              disabled={isSaving}
              spellCheck={false}
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>

          <label
            className="block text-sm font-medium text-white/72"
            htmlFor="template-category-description"
          >
            Описание
            <textarea
              id="template-category-description"
              disabled={isSaving}
              placeholder="Например: кейс для финалистов или отдельного трека"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>

          <label className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/78">
            <span>
              <span className="block font-medium text-white">Активная категория</span>
              <span className="mt-1 block text-xs leading-5 text-white/50">
                Неактивная категория останется в истории шаблона, но пропадёт из активного набора.
              </span>
            </span>
            <input
              checked={form.isActive}
              className="size-4 accent-primary"
              disabled={isSaving}
              type="checkbox"
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button className="btn-hero glow-primary rounded-2xl bg-white/[0.05]" type="submit">
              {isSaving ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  Saving
                </>
              ) : editingId ? (
                <>
                  <PencilLine aria-hidden="true" className="size-4" />
                  Save category
                </>
              ) : (
                <>
                  <Plus aria-hidden="true" className="size-4" />
                  Add category
                </>
              )}
            </button>

            {editingId ? (
              <button
                className="btn-hero rounded-2xl border border-white/10 bg-white/[0.04] text-white/80"
                type="button"
                onClick={resetForm}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/65">
          {message}
        </div>
      </section>

      <section className="space-y-3">
        {sortedCategories.length === 0 ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-6 py-8 text-center">
            <CheckCircle2 aria-hidden="true" className="mx-auto size-10 text-primary/80" />
            <h3 className="mt-4 text-lg font-black text-white">
              В этом шаблоне пока нет категорий
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">
              Добавьте локальные категории прямо здесь. Они будут существовать только внутри этого
              шаблона.
            </p>
          </div>
        ) : (
          sortedCategories.map((category) => {
            const isDeleteArmed = armedDeleteId === category.id;

            return (
              <article
                key={category.id}
                className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-white">{category.name}</h3>
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
                    <p className="text-xs uppercase tracking-[0.18em] text-white/40">
                      slug: {category.slug}
                    </p>
                    <p className="text-sm leading-6 text-white/62">
                      {category.description ?? "Описание не добавлено."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-hero rounded-2xl border border-white/10 bg-white/[0.04] text-white/80"
                      type="button"
                      onClick={() => {
                        setEditingId(category.id);
                        setForm({
                          name: category.name,
                          description: category.description ?? "",
                          isActive: category.is_active,
                        });
                        setArmedDeleteId(null);
                        setMessage(`Редактируется категория ${category.name}.`);
                      }}
                    >
                      <PencilLine aria-hidden="true" className="size-4" />
                      Edit
                    </button>
                    <button
                      className={cn(
                        "btn-hero rounded-2xl border text-white",
                        isDeleteArmed
                          ? "border-red-400/40 bg-red-500/20"
                          : "border-red-500/20 bg-red-500/10 text-red-100",
                      )}
                      type="button"
                      onClick={() => void handleDelete(category.id)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      {isDeleteArmed ? "Confirm delete" : "Delete"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
