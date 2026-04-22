"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ParticipantsImportForm } from "@/components/participants-import-form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CertificateStatus,
  type GenerationProgress,
  type ParticipantListResponse,
  type ParticipantSummary,
  type TemplateDetail,
  deleteParticipants,
  fetchGenerationProgress,
  fetchParticipants,
  fetchTemplate,
  requeueCertificateIssue,
  requeueFailedForTemplate,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

type ParticipantFilters = {
  category: string;
  email: string;
  certStatus: CertificateStatus | "";
};

const PARTICIPANTS_PAGE_SIZE = 20;

const STATUS_META: Record<
  CertificateStatus,
  { label: string; icon: typeof CheckCircle2; tone: string }
> = {
  not_created: { label: "Not created", icon: Clock, tone: "white" },
  queued: { label: "Queued", icon: Clock, tone: "amber" },
  processing: { label: "Processing", icon: Loader2, tone: "blue" },
  completed: { label: "Ready", icon: CheckCircle2, tone: "green" },
  failed: { label: "Failed", icon: XCircle, tone: "red" },
};

function statusBadgeClasses(tone: string) {
  const map: Record<string, string> = {
    white: "border-white/10 bg-white/[0.04] text-white/60",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    blue: "border-sky-500/20 bg-sky-500/10 text-sky-200",
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    red: "border-red-500/20 bg-red-500/10 text-red-200",
  };
  return map[tone] ?? map.white;
}

async function loadParticipants(
  templateId: string,
  filters: ParticipantFilters,
  page: number,
) {
  const { data } = await fetchParticipants({
    category: filters.category || undefined,
    email: filters.email || undefined,
    eventCode: templateId,
    page,
    pageSize: PARTICIPANTS_PAGE_SIZE,
  });
  return data ?? null;
}

async function loadProgress(templateId: string) {
  const { data } = await fetchGenerationProgress(templateId);
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
  const [certStatus, setCertStatus] = useState<CertificateStatus | "">("");
  const [participants, setParticipants] =
    useState<ParticipantListResponse | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [requeueingId, setRequeueingId] = useState<string | null>(null);
  const [bulkRequeueing, setBulkRequeueing] = useState(false);

  const filteredParticipants = useMemo(() => {
    if (!participants) return null;
    if (!certStatus) return participants;
    const items = participants.items.filter(
      (p) => p.certificate_status === certStatus,
    );
    return { ...participants, items, total: items.length };
  }, [participants, certStatus]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [{ data: tpl }, prg] = await Promise.all([
          fetchTemplate(id),
          loadProgress(id),
        ]);
        if (!isMounted) return;
        setTemplate(tpl ?? null);
        setProgress(prg);
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
    void loadParticipants(id, { category, email, certStatus: "" }, page)
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

  async function refreshProgress() {
    const prg = await loadProgress(id);
    setProgress(prg);
  }

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
      setParticipants((current) =>
        current ? { ...current, items: [], total: 0 } : current,
      );
      if (page === 1) {
        const refreshed = await loadParticipants(
          id,
          { category, email, certStatus: "" },
          1,
        );
        setParticipants(refreshed);
      } else {
        setPage(1);
      }
      await refreshProgress();
      toast.success("Roster cleared.");
    } else {
      toast.error("Failed to delete roster.");
    }
  }

  async function handleRequeueIssue(issueId: string | null) {
    if (!issueId) return;
    setRequeueingId(issueId);
    try {
      await requeueCertificateIssue(issueId);
      const refreshed = await loadParticipants(
        id,
        { category, email, certStatus: "" },
        page,
      );
      setParticipants(refreshed);
      await refreshProgress();
      toast.success("Certificate requeued.");
    } catch {
      toast.error("Failed to requeue certificate.");
    } finally {
      setRequeueingId(null);
    }
  }

  async function handleRequeueAllFailed() {
    if (!id) return;
    if (!window.confirm("Requeue all failed certificates for this template?"))
      return;
    setBulkRequeueing(true);
    try {
      await requeueFailedForTemplate(id);
      const refreshed = await loadParticipants(
        id,
        { category, email, certStatus: "" },
        page,
      );
      setParticipants(refreshed);
      await refreshProgress();
      toast.success("All failed certificates requeued.");
    } catch {
      toast.error("Failed to requeue certificates.");
    } finally {
      setBulkRequeueing(false);
    }
  }

  if (isLoading || !template) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </section>
    );
  }

  const readyPercent =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <Link
          className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white"
          href={`/admin/templates/${id}`}
        >
          <ArrowLeft className="size-4" />
          Back to template
        </Link>

        <h1 className="heading-hero text-gradient text-left">
          {template.template.name}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
          Import, filter, and track certificate generation status for every
          participant.
        </p>
      </div>

      {progress && progress.total > 0 && (
        <div className="rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
                Generation progress
              </p>
              <p className="mt-1 text-sm text-white/70">
                {progress.completed} of {progress.total} certificates ready
                {progress.failed > 0 && (
                  <span className="ml-2 text-red-300">
                    ({progress.failed} failed)
                  </span>
                )}
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/80">
              {readyPercent}%
            </span>
          </div>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all"
              style={{ width: `${readyPercent}%` }}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["completed", progress.completed, "emerald"],
                ["queued", progress.queued, "amber"],
                ["processing", progress.processing, "sky"],
                ["failed", progress.failed, "red"],
                ["not_created", progress.not_created, "white"],
              ] as const
            ).map(([key, count, tone]) =>
              count > 0 ? (
                <button
                  key={key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                    certStatus === key
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : statusBadgeClasses(tone),
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  )}
                  onClick={() => {
                    setCertStatus((prev) =>
                      prev === key ? "" : (key as CertificateStatus),
                    );
                    setPage(1);
                  }}
                  type="button"
                >
                  <span className="font-medium capitalize">
                    {key.replace("_", " ")}
                  </span>
                  <span className="opacity-70">{count}</span>
                </button>
              ) : null,
            )}
          </div>

          {progress.failed > 0 && (
            <button
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-100 transition hover:border-red-400/40 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
              disabled={bulkRequeueing}
              onClick={() => void handleRequeueAllFailed()}
              type="button"
            >
              {bulkRequeueing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Requeue all failed
            </button>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <ParticipantsImportForm
          templateId={id}
          templateName={template.template.name}
          onImported={async () => {
            const refreshed = await loadParticipants(
              id,
              { category, email, certStatus: "" },
              page,
            );
            setParticipants(refreshed);
            await refreshProgress();
          }}
        />

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-white/80">
                Email filter
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65" />
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 pl-11 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                    placeholder="Search by email..."
                    value={email}
                    onChange={(event) => {
                      setPage(1);
                      setEmail(event.target.value);
                    }}
                  />
                </div>
              </label>
              <label className="block text-sm font-medium text-white/80">
                Category
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                  placeholder="Filter category..."
                  value={category}
                  onChange={(event) => {
                    setPage(1);
                    setCategory(event.target.value);
                  }}
                />
              </label>
              <label className="block text-sm font-medium text-white/80">
                Certificate status
                <div className="relative mt-2">
                  <Filter className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65" />
                  <select
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 pl-11 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40"
                    value={certStatus}
                    onChange={(event) => {
                      setPage(1);
                      setCertStatus(
                        event.target.value as CertificateStatus | "",
                      );
                    }}
                  >
                    <option value="">All statuses</option>
                    <option value="not_created">Not created</option>
                    <option value="queued">Queued</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Ready</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
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

          <div className="rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
                  Current list
                </p>
                <h2 className="mt-3 text-2xl font-black text-white">
                  Imported rows
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
                {filteredParticipants?.total ?? 0} rows
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-black/30 text-white/60">
                    <tr>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Certificate</th>
                      <th className="px-4 py-3 font-medium text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants?.items.length ? (
                      filteredParticipants.items.map((participant) => (
                        <ParticipantRow
                          key={participant.id}
                          participant={participant}
                          requeueingId={requeueingId}
                          onRequeue={handleRequeueIssue}
                        />
                      ))
                    ) : (
                      <tr>
                        <td
                          className="px-4 py-8 text-center text-white/55"
                          colSpan={5}
                        >
                          {certStatus
                            ? `No participants with status "${certStatus.replace("_", " ")}".`
                            : "No rows loaded yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
              <span>
                {filteredParticipants
                  ? `${formatParticipantRange(filteredParticipants)} of ${filteredParticipants.total} rows`
                  : "No rows loaded yet."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={
                    !filteredParticipants || filteredParticipants.page <= 1
                  }
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <button
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={
                    !filteredParticipants ||
                    filteredParticipants.page *
                      filteredParticipants.page_size >=
                      filteredParticipants.total
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

function ParticipantRow({
  participant,
  requeueingId,
  onRequeue,
}: {
  participant: ParticipantSummary;
  requeueingId: string | null;
  onRequeue: (id: string | null) => void;
}) {
  const meta = STATUS_META[participant.certificate_status];
  const Icon = meta.icon;
  const isRequeueing = requeueingId === participant.certificate_id;

  return (
    <tr className="border-t border-white/10 transition hover:bg-white/[0.02]">
      <td className="px-4 py-3 text-white/75">{participant.email}</td>
      <td className="px-4 py-3 text-white/75">{participant.full_name}</td>
      <td className="px-4 py-3 text-white/75">{participant.category ?? "—"}</td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
            statusBadgeClasses(meta.tone),
          )}
          title={participant.last_error ?? undefined}
        >
          <Icon
            className={cn(
              "size-3 shrink-0",
              participant.certificate_status === "processing" && "animate-spin",
            )}
          />
          {meta.label}
          {participant.attempts != null && participant.attempts > 0 && (
            <span className="opacity-60">· {participant.attempts}</span>
          )}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {participant.certificate_status === "failed" && (
          <button
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-100 transition hover:border-red-400/40 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
            disabled={isRequeueing}
            onClick={() => onRequeue(participant.certificate_id)}
            title={participant.last_error ?? "Retry generation"}
            type="button"
          >
            {isRequeueing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RotateCcw className="size-3" />
            )}
            Retry
          </button>
        )}
      </td>
    </tr>
  );
}

function formatParticipantRange(participants: ParticipantListResponse) {
  if (!participants.total) {
    return "0";
  }
  const start = (participants.page - 1) * participants.page_size + 1;
  const end = Math.min(
    participants.page * participants.page_size,
    participants.total,
  );
  return `${start}-${end}`;
}
