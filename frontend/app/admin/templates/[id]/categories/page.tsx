"use client";

import { CheckCircle2, PencilLine, Plus, Trash2 } from "lucide-react";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin-page-header";
import { AdminPanel } from "@/components/admin-panel";
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
      <AdminPanel as="section" className="text-sm text-white/65">
        Loading categories...
      </AdminPanel>
    );
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        backHref={`/admin/templates/${id}`}
        backLabel="Back to template"
        description="Categories for this template. Add, edit and delete as needed."
        title={template.template.name}
      />

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <CategoryForm
          templateId={id}
          onCreated={(category) => {
            setCategories((current) => [...current, category]);
          }}
        />

        <div className="space-y-3">
          {categories.length === 0 ? (
            <AdminPanel className="p-8 text-center">
              <CheckCircle2 className="mx-auto size-10 text-primary/80" />
              <h3 className="mt-4 text-lg font-black text-white">No categories yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">
                Add categories using the form on the left.
              </p>
            </AdminPanel>
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Category name is required.");
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
        toast.error("Failed to create category.");
        return;
      }
      onCreated(data);
      toast.success(`Category "${data.name}" added.`);
      setForm(INITIAL_FORM);
    } catch {
      toast.error("Failed to create category.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminPanel>
      <p className="admin-eyebrow">Add category</p>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-white/80" htmlFor="cat-name">
          Name
          <input
            id="cat-name"
            autoComplete="off"
            className="admin-input mt-2"
            disabled={isSaving}
            spellCheck={false}
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>

        <label className="block text-sm font-medium text-white/80" htmlFor="cat-desc">
          Description
          <textarea
            id="cat-desc"
            className="admin-input mt-2"
            disabled={isSaving}
            placeholder="e.g. finalists track"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>

        <label className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80">
          <span>
            <span className="block font-medium text-white">Active</span>
            <span className="mt-1 block text-xs leading-5 text-white/50">
              Inactive categories remain in history but disappear from the active set.
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
    </AdminPanel>
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
      if (!response.ok || !data) {
        toast.error("Failed to save category.");
        return;
      }
      onUpdate(data);
      setEditing(false);
      toast.success("Category updated.");
    } catch {
      toast.error("Failed to save category.");
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
      toast.success("Category deleted.");
    } else {
      toast.error("Failed to delete category.");
    }
  }

  return (
    <AdminPanel>
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
                "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                category.is_active
                  ? "border border-primary/25 bg-primary/10 text-primary"
                  : "border border-white/10 bg-white/[0.04] text-white/55",
              )}
            >
              {category.is_active ? "Active" : "Archived"}
            </span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
            slug: {category.slug}
          </p>
          {editing ? (
            <textarea
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white/80 outline-none focus:border-primary/60"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          ) : (
            <p className="text-sm leading-6 text-white/65">
              {category.description ?? "No description added."}
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
    </AdminPanel>
  );
}
