"use client";

import { Search, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { ParticipantsImportForm } from "@/components/participants-import-form";
import {
  type ParticipantListResponse,
  type TemplateDetail,
  deleteParticipants,
  fetchParticipants,
  fetchTemplates,
} from "@/lib/admin-api";

type ParticipantFilters = {
  category: string;
  email: string;
  eventCode: string;
};

async function loadParticipants(filters: ParticipantFilters) {
  const { data } = await fetchParticipants({
    category: filters.category || undefined,
    email: filters.email || undefined,
    eventCode: filters.eventCode,
    page: 1,
    pageSize: 20,
  });

  return data ?? null;
}

export default function AdminParticipantsPage() {
  const [templates, setTemplates] = useState<TemplateDetail[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [participants, setParticipants] = useState<ParticipantListResponse | null>(null);
  const [message, setMessage] = useState("Loading templates...");

  const selectedTemplate =
    templates.find((template) => template.template.id === selectedTemplateId) ?? null;

  useEffect(() => {
    let isMounted = true;

    async function loadTemplates() {
      try {
        const { data } = await fetchTemplates();
        if (!isMounted) {
          return;
        }

        const nextTemplates = data ?? [];
        setTemplates(nextTemplates);
        setSelectedTemplateId((current) => {
          if (current && nextTemplates.some((template) => template.template.id === current)) {
            return current;
          }

          return (
            nextTemplates.find((template) => template.template.is_active)?.template.id ??
            nextTemplates[0]?.template.id ??
            ""
          );
        });

        if (!nextTemplates.length) {
          setMessage("Upload a template first.");
        }
      } catch {
        if (isMounted) {
          setMessage("Could not load templates.");
        }
      }
    }

    void loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      setParticipants(null);
      return;
    }

    let isMounted = true;
    setMessage("Loading participants...");

    void loadParticipants({ category, email, eventCode: selectedTemplateId })
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setParticipants(data);
        setMessage(data?.items.length ? "Participants loaded." : "No participants found.");
      })
      .catch(() => {
        if (isMounted) {
          setMessage("Could not load participants.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [category, email, selectedTemplateId]);

  async function handleDeleteRoster() {
    if (!selectedTemplateId) {
      return;
    }

    if (
      !window.confirm(
        `Delete all participants linked to ${selectedTemplate?.template.name ?? "the selected template"}?`,
      )
    ) {
      return;
    }

    const { response } = await deleteParticipants(selectedTemplateId);
    if (response.ok) {
      setParticipants((current) => (current ? { ...current, items: [], total: 0 } : current));
      setMessage("Template roster deleted.");
      const refreshed = await loadParticipants({ category, email, eventCode: selectedTemplateId });
      setParticipants(refreshed);
    }
  }

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <Users className="size-4 text-primary" />
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Participants
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">База участников.</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Pick a template first. Participants are imported, filtered and deleted inside that
          template roster.
        </p>
      </div>

      <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
              Template roster
            </p>
            <h2 className="mt-3 text-2xl font-black text-white">Choose the target template</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
              The selected template becomes the import target and the only roster shown below.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
            {templates.length} templates
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.length ? (
            templates.map((template) => (
              <button
                key={template.template.id}
                className={
                  template.template.id === selectedTemplateId
                    ? "rounded-[1.5rem] border border-primary/35 bg-primary/10 p-4 text-left transition"
                    : "rounded-[1.5rem] border border-white/10 bg-black/20 p-4 text-left transition hover:border-primary/25 hover:bg-white/[0.04]"
                }
                type="button"
                onClick={() => setSelectedTemplateId(template.template.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary/80">
                      {template.template.source_kind.toUpperCase()}
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-white">
                      {template.template.name}
                    </h3>
                  </div>
                  {template.template.is_active ? (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-primary">
                      Active
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-white/58">
                  {template.template.has_layout ? "Layout configured" : "Layout missing"}
                </p>
              </button>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              No templates uploaded yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/68">
        {message}
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <ParticipantsImportForm
          templateId={selectedTemplateId || null}
          templateName={selectedTemplate?.template.name ?? null}
          onImported={async () => {
            if (!selectedTemplateId) {
              return;
            }

            setMessage("Import completed. Refreshing list...");
            const refreshed = await loadParticipants({
              category,
              email,
              eventCode: selectedTemplateId,
            });
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
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </label>
              <label className="block text-sm font-medium text-white/72">
                Category
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="btn-hero rounded-2xl border border-red-500/20 bg-red-500/10 text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedTemplateId}
                type="button"
                onClick={() => void handleDeleteRoster()}
              >
                Delete template roster
              </button>
              <span className="text-sm text-white/52">
                {selectedTemplate
                  ? `Current template: ${selectedTemplate.template.name}`
                  : "Select a template to enable actions."}
              </span>
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
                  {selectedTemplateId && participants?.items.length ? (
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
                        {selectedTemplateId
                          ? "No rows loaded yet."
                          : "Select a template to load participants."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
