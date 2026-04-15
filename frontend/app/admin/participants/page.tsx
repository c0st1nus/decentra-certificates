"use client";

import { Search, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { ParticipantsImportForm } from "@/components/participants-import-form";
import {
  type ParticipantListResponse,
  deleteParticipants,
  fetchParticipants,
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
  const [eventCode, setEventCode] = useState("main");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [participants, setParticipants] = useState<ParticipantListResponse | null>(null);
  const [message, setMessage] = useState("Loading participants...");

  useEffect(() => {
    let isMounted = true;

    void loadParticipants({ category, email, eventCode })
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
  }, [category, email, eventCode]);

  async function handleDeleteEvent() {
    if (!window.confirm(`Delete participants for event ${eventCode}?`)) {
      return;
    }

    const { response } = await deleteParticipants(eventCode);
    if (response.ok) {
      setParticipants((current) => (current ? { ...current, items: [], total: 0 } : current));
      setMessage("Event participants deleted.");
      const refreshed = await loadParticipants({ category, email, eventCode });
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
          Import a CSV, inspect validation errors, and filter the current event roster.
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/68">
        {message}
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <ParticipantsImportForm
          onImported={async () => {
            setMessage("Import completed. Refreshing list...");
            const refreshed = await loadParticipants({ category, email, eventCode });
            setParticipants(refreshed);
          }}
        />

        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-white/72">
                Event code
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                  value={eventCode}
                  onChange={(event) => setEventCode(event.target.value)}
                />
              </label>
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

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="btn-hero rounded-2xl border border-red-500/20 bg-red-500/10 text-red-100"
                type="button"
                onClick={() => void handleDeleteEvent()}
              >
                Delete event participants
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
          </div>
        </div>
      </div>
    </section>
  );
}
