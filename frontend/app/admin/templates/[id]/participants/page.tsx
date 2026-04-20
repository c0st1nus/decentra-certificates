"use client";

import { ArrowLeft, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { ParticipantsImportForm } from "@/components/participants-import-form";
import {
  type ParticipantListResponse,
  type TemplateDetail,
  deleteParticipants,
  fetchParticipants,
  fetchTemplate,
} from "@/lib/admin-api";

type ParticipantFilters = {
  category: string;
  email: string;
};

const PARTICIPANTS_PAGE_SIZE = 20;

async function loadParticipants(templateId: string, filters: ParticipantFilters, page: number) {
  const { data } = await fetchParticipants({
    category: filters.category || undefined,
    email: filters.email || undefined,
    eventCode: templateId,
    page,
    pageSize: PARTICIPANTS_PAGE_SIZE,
  });

  return data ?? null;
}

type Props = {
  params: Promise<{ id: string }>;
};

export default function TemplateParticipantsPage({ params }: Props) {
  const { id } = use(params);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [participants, setParticipants] = useState<ParticipantListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const { data } = await fetchTemplate(id);
        if (!isMounted) return;
        setTemplate(data ?? null);
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

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    void loadParticipants(id, { category, email }, page)
      .then((data) => {
        if (!isMounted) return;
        setParticipants(data);
      })
      .catch(() => {
        if (!isMounted) return;
      });

    return () => {
      isMounted = false;
    };
  }, [category, email, page, id]);

  async function handleDeleteRoster() {
    if (!id) return;

    if (
      !window.confirm(
        `Delete all participants linked to ${template?.template.name ?? "this template"}?`,
      )
    ) {
      return;
    }

    const { response } = await deleteParticipants(id);
    if (response.ok) {
      setParticipants((current) => (current ? { ...current, items: [], total: 0 } : current));
      if (page === 1) {
        const refreshed = await loadParticipants(id, { category, email }, 1);
        setParticipants(refreshed);
      } else {
        setPage(1);
      }
    }
  }

  if (isLoading || !template) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 text-sm text-white/65 backdrop-blur-xl">
        Loading participants...
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
          <Users className="size-4 text-primary" />
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Participants
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">{template.template.name}</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Импорт, фильтры и список участников для этого шаблона.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <ParticipantsImportForm
          templateId={id}
          templateName={template.template.name}
          onImported={async () => {
            const refreshed = await loadParticipants(id, { category, email }, page);
            setParticipants(refreshed);
          }}
        />

        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-white/72">
                Email filter
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65" />
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 pl-11 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                    value={email}
                    onChange={(event) => {
                      setPage(1);
                      setEmail(event.target.value);
                    }}
                  />
                </div>
              </label>
              <label className="block text-sm font-medium text-white/72">
                Category
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                  value={category}
                  onChange={(event) => {
                    setPage(1);
                    setCategory(event.target.value);
                  }}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="btn-hero rounded-2xl border border-red-500/20 bg-red-500/10 text-red-100"
                type="button"
                onClick={() => void handleDeleteRoster()}
              >
                <Trash2 className="size-4" />
                Delete roster
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                  Current list
                </p>
                <h2 className="mt-3 text-2xl font-black text-white">Imported rows</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
                {participants?.total ?? 0} rows
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/10">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-black/30 text-white/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {participants?.items.length ? (
                    participants.items.map((participant) => (
                      <tr key={participant.id} className="border-t border-white/10">
                        <td className="px-4 py-3 text-white/72">{participant.email}</td>
                        <td className="px-4 py-3 text-white/72">{participant.full_name}</td>
                        <td className="px-4 py-3 text-white/72">{participant.category ?? "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-8 text-center text-white/55" colSpan={3}>
                        No rows loaded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
              <span>
                {participants
                  ? `${formatParticipantRange(participants)} of ${participants.total} rows`
                  : "No rows loaded yet."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!participants || participants.page <= 1}
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <button
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={
                    !participants ||
                    participants.page * participants.page_size >= participants.total
                  }
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatParticipantRange(participants: ParticipantListResponse) {
  if (!participants.total) {
    return "0";
  }

  const start = (participants.page - 1) * participants.page_size + 1;
  const end = Math.min(participants.page * participants.page_size, participants.total);
  return `${start}-${end}`;
}
