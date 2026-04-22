"use client";

import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Download,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { FormEvent, MutableRefObject, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  type AvailableCertificate,
  type CertificateJobStatus,
  type CertificateRequestQueued,
  type CertificateRequestSuccess,
  buildApiUrl,
  checkCertificates,
  requestCertificate,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type SuccessPayload = {
  certificateId: string;
  downloadUrl: string;
  fullName: string;
  message: string;
  templateName: string;
  verificationCode: string | null;
  verificationUrl: string;
};

type RequestState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "select"; certificates: AvailableCertificate[]; fullName: string | null }
  | { kind: "requesting"; certificate: AvailableCertificate }
  | {
      kind: "waiting";
      certificateId: string;
      fullName: string;
      jobId: string;
      message: string;
      phase: "connecting" | "queued" | "processing";
      templateName: string;
      verificationUrl: string;
    }
  | { kind: "success"; payload: SuccessPayload }
  | { kind: "issuance_disabled"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "error"; message: string };

const initialMessage =
  "Enter the email used during registration. We will show all available certificates and immediately start the one you need.";

export function EmailRequestForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<RequestState>({ kind: "idle" });
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      closeStream(streamRef);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setState({ kind: "error", message: "Enter your email to continue." });
      return;
    }

    closeStream(streamRef);
    setState({ kind: "checking" });

    try {
      const { data, response } = await checkCertificates(normalizedEmail);

      if (!response.ok || !data) {
        if (response.status === 403) {
          setState({
            kind: "issuance_disabled",
            message: "Certificate issuance is not open yet.",
          });
          return;
        }

        if (response.status === 429) {
          setState({
            kind: "rate_limited",
            message: "Too many requests. Please wait a moment and try again.",
          });
          return;
        }

        const message =
          data && "message" in data && typeof data.message === "string"
            ? data.message
            : "Something went wrong. Please try again later.";
        setState({ kind: "error", message });
        return;
      }

      if (data.certificates.length === 0) {
        setState({
          kind: "not_found",
          message: "This email was not found in the participant database.",
        });
        return;
      }

      setState({ kind: "select", certificates: data.certificates, fullName: data.full_name });
    } catch {
      setState({
        kind: "error",
        message: "Unable to reach the server. Check your connection and try again.",
      });
    }
  }

  async function handleRequestCertificate(certificate: AvailableCertificate) {
    closeStream(streamRef);
    setState({ kind: "requesting", certificate });

    try {
      const { data, response } = await requestCertificate(email.trim(), certificate.template_id);

      if (response.ok && isSuccessResponse(data)) {
        setState({ kind: "success", payload: normalizeSuccess(data) });
        return;
      }

      if (response.status === 202 && isQueuedResponse(data)) {
        startJobStream(data);
        return;
      }

      const message =
        data && "message" in data && typeof data.message === "string"
          ? data.message
          : "Something went wrong. Please try again later.";

      if (response.status === 403) {
        setState({
          kind: "issuance_disabled",
          message: "Certificate issuance is not open yet.",
        });
        return;
      }

      if (response.status === 404) {
        setState({
          kind: "not_found",
          message: "Certificate not found.",
        });
        return;
      }

      if (response.status === 429) {
        setState({
          kind: "rate_limited",
          message: "Too many requests. Please wait a moment and try again.",
        });
        return;
      }

      setState({ kind: "error", message });
    } catch {
      setState({
        kind: "error",
        message: "Unable to reach the server. Check your connection and try again.",
      });
    }
  }

  function startJobStream(payload: CertificateRequestQueued) {
    setState({
      kind: "waiting",
      certificateId: payload.certificate_id,
      fullName: payload.full_name,
      jobId: payload.job_id,
      message: payload.message,
      phase: "connecting",
      templateName: payload.template_name,
      verificationUrl: payload.verification_url,
    });

    const source = new EventSource(buildApiUrl(payload.events_url));
    streamRef.current = source;

    source.addEventListener("status", (event) => {
      const parsed = parseJobEvent(event);
      if (!parsed) {
        return;
      }

      if (parsed.status === "completed" && parsed.download_url && parsed.verification_url) {
        closeStream(streamRef);
        setState({ kind: "success", payload: normalizeCompletedJob(parsed) });
        return;
      }

      if (parsed.status === "failed") {
        closeStream(streamRef);
        setState({
          kind: "error",
          message: parsed.message || "Failed to generate certificate. Please try again.",
        });
        return;
      }

      setState({
        kind: "waiting",
        certificateId: parsed.certificate_id,
        fullName: parsed.full_name,
        jobId: parsed.job_id,
        message: parsed.message,
        phase: parsed.status === "processing" ? "processing" : "queued",
        templateName: parsed.template_name,
        verificationUrl: parsed.verification_url ?? payload.verification_url,
      });
    });

    source.addEventListener("error", () => {
      closeStream(streamRef);
      setState({
        kind: "error",
        message:
          "Lost connection to the generation queue. Repeat the request and we will bump your certificate again.",
      });
    });
  }

  function retry() {
    if (!email.trim()) {
      closeStream(streamRef);
      setState({ kind: "idle" });
      return;
    }

    void submitAgain();
  }

  async function submitAgain() {
    const form = document.getElementById("certificate-request-form");
    if (form instanceof HTMLFormElement) {
      if (!form.reportValidity()) {
        return;
      }
      form.requestSubmit();
    }
  }

  const isChecking = state.kind === "checking";
  const isRequesting = state.kind === "requesting";
  const isWaiting = state.kind === "waiting";
  const isLoading = isChecking || isRequesting || isWaiting;

  return (
    <section className="rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
            Public issuance
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">Claim certificate</h2>
        </div>
        <ShieldCheck className="size-5 shrink-0 text-primary/85" />
      </div>

      <form
        id="certificate-request-form"
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label className="block text-sm font-medium text-white/80" htmlFor="email">
          Certificate email
        </label>

        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65"
          />
          <input
            id="email"
            aria-busy={isLoading}
            autoComplete="email"
            className={cn(
              "w-full rounded-2xl border border-white/10 bg-black/35 py-3.5 pl-11 pr-4 text-base text-white outline-none transition-colors focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40",
              isLoading && "cursor-not-allowed opacity-80",
            )}
            disabled={isLoading}
            placeholder="name@example.com"
            spellCheck={false}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <button className="btn-hero glow-primary w-full rounded-2xl bg-white/[0.05]" type="submit">
          {isChecking ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              Checking email
            </>
          ) : (
            <>
              <span>Find certificates</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </>
          )}
        </button>
      </form>

      <div
        aria-live="polite"
        className={cn(
          "mt-5 rounded-2xl border p-4",
          state.kind === "idle" && "border-white/10 bg-white/[0.03] text-white/70",
          state.kind === "checking" && "border-primary/25 bg-primary/[0.08] text-white/80",
          state.kind === "select" && "border-primary/30 bg-primary/10 text-white",
          (state.kind === "requesting" || state.kind === "waiting") &&
            "border-primary/25 bg-primary/[0.08] text-white/80",
          state.kind === "success" && "border-primary/30 bg-primary/10 text-white",
          state.kind === "issuance_disabled" &&
            "border-amber-500/25 bg-amber-500/10 text-amber-100",
          state.kind === "not_found" && "border-white/10 bg-white/[0.03] text-white/75",
          (state.kind === "rate_limited" || state.kind === "error") &&
            "border-red-500/25 bg-red-500/10 text-red-100",
        )}
      >
        {state.kind === "idle" && <StatusIdle message={initialMessage} />}

        {state.kind === "checking" && <StatusLoading />}

        {state.kind === "select" && (
          <CertificateSelector
            certificates={state.certificates}
            fullName={state.fullName}
            onSelect={(certificate) => void handleRequestCertificate(certificate)}
          />
        )}

        {state.kind === "requesting" && (
          <StatusRequesting templateName={state.certificate.template_name} />
        )}

        {state.kind === "waiting" && <StatusWaiting state={state} />}

        {state.kind === "success" && <StatusSuccess data={state.payload} />}

        {state.kind === "issuance_disabled" && (
          <StatusNotice
            icon={<ShieldCheck aria-hidden="true" className="size-5 text-amber-300" />}
            message={state.message}
            title="Issuance disabled"
          />
        )}

        {state.kind === "not_found" && (
          <StatusNotice
            action={
              <button
                className="btn-hero mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04]"
                type="button"
                onClick={retry}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Try again
              </button>
            }
            icon={<AlertTriangle aria-hidden="true" className="size-5 text-white/90" />}
            message={state.message}
            title="Email not found"
          />
        )}

        {state.kind === "rate_limited" && (
          <StatusNotice
            action={
              <button
                className="btn-hero mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04]"
                type="button"
                onClick={retry}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Retry request
              </button>
            }
            icon={<AlertTriangle aria-hidden="true" className="size-5 text-red-200" />}
            message={state.message}
            title="Too many requests"
          />
        )}

        {state.kind === "error" && (
          <StatusNotice
            action={
              <button
                className="btn-hero mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04]"
                type="button"
                onClick={retry}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Retry request
              </button>
            }
            icon={<AlertTriangle aria-hidden="true" className="size-5 text-red-200" />}
            message={state.message}
            title="Request error"
          />
        )}
      </div>
    </section>
  );
}

function CertificateSelector({
  certificates,
  fullName,
  onSelect,
}: {
  certificates: AvailableCertificate[];
  fullName: string | null;
  onSelect: (certificate: AvailableCertificate) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <BadgeCheck aria-hidden="true" className="mt-0.5 size-5 text-primary" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Found
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            {fullName ? `Certificates for ${fullName}` : "Available certificates"}
          </p>
          <p className="mt-1 text-sm leading-6 text-white/70">
            Ready certificates can be downloaded immediately. If the PDF is not built yet, we will
            bump it to the priority queue.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {certificates.map((certificate) => {
          const statusMeta = getCertificateActionMeta(certificate);
          return (
            <div
              key={certificate.template_id}
              className="rounded-2xl border border-white/10 bg-black/25 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">{certificate.template_name}</h3>
                    {certificate.category && (
                      <p className="text-xs text-white/50">Category: {certificate.category}</p>
                    )}
                  </div>

                  <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] text-white/70">
                    <span className={cn("size-2 rounded-full", statusMeta.dotClassName)} />
                    {statusMeta.label}
                  </span>
                </div>

                {certificate.download_url ? (
                  <a
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary transition-colors hover:border-primary/40 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    href={buildApiUrl(certificate.download_url)}
                  >
                    <Download aria-hidden="true" className="size-3.5" />
                    Download PDF
                  </a>
                ) : (
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary transition-colors hover:border-primary/40 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    type="button"
                    onClick={() => onSelect(certificate)}
                  >
                    {statusMeta.icon}
                    {statusMeta.action}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusIdle({ message }: { message: string }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">Status</p>
      <p className="max-w-md text-sm leading-6 text-white/75">{message}</p>
    </div>
  );
}

function StatusLoading() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-primary">
        <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Checking participant
        </p>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/[0.08] motion-reduce:animate-none" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/[0.08] motion-reduce:animate-none" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-white/[0.08] motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function StatusRequesting({ templateName }: { templateName: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-primary">
        <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Starting queue
        </p>
      </div>
      <p className="text-sm text-white/70">
        Reserving certificate for template &quot;{templateName}&quot; and bumping the job to the
        priority queue.
      </p>
    </div>
  );
}

function StatusWaiting({ state }: { state: Extract<RequestState, { kind: "waiting" }> }) {
  const isConnecting = state.phase === "connecting";
  const isProcessing = state.phase === "processing";
  const stepClassName = isProcessing ? "bg-primary text-black" : "bg-white/[0.06] text-white/70";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-0.5 size-5 text-primary" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Queue live
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            Generating certificate for {state.fullName}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/70">{state.message}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ProgressStep active title="Request accepted" />
        <ProgressStep active={!isConnecting} title="Queue connected" />
        <ProgressStep active={isProcessing} title="PDF rendering" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MetaPill label="Certificate ID" value={state.certificateId} mono />
        <MetaPill label="Template" value={state.templateName} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-primary">
          <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          <p className="text-sm font-medium text-white">
            {isProcessing
              ? "Building PNG and PDF on the server"
              : "Waiting for the next free worker"}
          </p>
        </div>
        <div className="mt-3 grid gap-2">
          <div className={cn("h-2 rounded-full", stepClassName)} />
          <div className="h-2 w-4/5 rounded-full bg-white/[0.08]" />
          <div className="h-2 w-3/5 rounded-full bg-white/[0.08]" />
        </div>
      </div>
    </div>
  );
}

function StatusSuccess({ data }: { data: SuccessPayload }) {
  const downloadHref = buildApiUrl(data.downloadUrl);
  const verificationHref = buildApiUrl(data.verificationUrl);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <BadgeCheck aria-hidden="true" className="mt-0.5 size-5 text-primary" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Success
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            Certificate ready for {data.fullName}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/70">
            {data.message} Template: {data.templateName}.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MetaPill label="Certificate ID" value={data.certificateId} mono />
        <MetaPill
          label="Verification code"
          value={data.verificationCode ?? "Open verification link"}
          mono={Boolean(data.verificationCode)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <a className="btn-hero glow-primary rounded-2xl bg-white/[0.06]" href={downloadHref}>
          <Download aria-hidden="true" className="size-4" />
          Download PDF
        </a>
        <a
          className="btn-hero rounded-2xl border border-white/10 bg-white/[0.04]"
          href={verificationHref}
        >
          <BadgeCheck aria-hidden="true" className="size-4" />
          Verify certificate
        </a>
      </div>
    </div>
  );
}

function StatusNotice({
  action,
  icon,
  message,
  title,
}: {
  action?: ReactNode;
  icon: ReactNode;
  message: string;
  title: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
            {title}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/75">{message}</p>
        </div>
      </div>
      {action ? action : null}
    </div>
  );
}

function ProgressStep({ active, title }: { active: boolean; title: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3 text-sm transition-colors",
        active
          ? "border-primary/35 bg-primary/12 text-white"
          : "border-white/10 bg-white/[0.03] text-white/55",
      )}
    >
      <p className="font-medium">{title}</p>
    </div>
  );
}

function MetaPill({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">{label}</p>
      <p className={cn("mt-2 text-sm text-white/80", mono && "font-mono text-[11px]")}>{value}</p>
    </div>
  );
}

function getCertificateActionMeta(certificate: AvailableCertificate) {
  switch (certificate.generation_status) {
    case "ready":
      return {
        action: "Download PDF",
        dotClassName: "bg-primary",
        icon: <Download aria-hidden="true" className="size-3.5" />,
        label: "Ready to download",
      };
    case "queued":
      return {
        action: "Bump queue",
        dotClassName: "bg-amber-300",
        icon: <Sparkles aria-hidden="true" className="size-3.5" />,
        label: "Already queued",
      };
    case "processing":
      return {
        action: "Watch generation",
        dotClassName: "bg-primary",
        icon: <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />,
        label: "Building right now",
      };
    case "failed":
      return {
        action: "Restart build",
        dotClassName: "bg-red-300",
        icon: <RefreshCw aria-hidden="true" className="size-3.5" />,
        label: "Previous build failed",
      };
    default:
      return {
        action: "Generate",
        dotClassName: "bg-white/60",
        icon: <ArrowRight aria-hidden="true" className="size-3.5" />,
        label: "Not built yet",
      };
  }
}

function normalizeSuccess(data: CertificateRequestSuccess): SuccessPayload {
  return {
    certificateId: data.certificate_id,
    downloadUrl: data.download_url,
    fullName: data.full_name,
    message: data.message,
    templateName: data.template_name,
    verificationCode: data.verification_code,
    verificationUrl: data.verification_url,
  };
}

function normalizeCompletedJob(data: CertificateJobStatus): SuccessPayload {
  return {
    certificateId: data.certificate_id,
    downloadUrl: data.download_url ?? `/api/v1/public/certificates/${data.certificate_id}/download`,
    fullName: data.full_name,
    message: data.message,
    templateName: data.template_name,
    verificationCode: data.verification_code,
    verificationUrl:
      data.verification_url ??
      `/api/v1/public/certificates/verify/${data.verification_code ?? data.certificate_id}`,
  };
}

function parseJobEvent(event: Event): CertificateJobStatus | null {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return null;
  }

  try {
    return JSON.parse(event.data) as CertificateJobStatus;
  } catch {
    return null;
  }
}

function isQueuedResponse(data: unknown): data is CertificateRequestQueued {
  return Boolean(
    data &&
      typeof data === "object" &&
      "status" in data &&
      data.status === "queued" &&
      "events_url" in data,
  );
}

function isSuccessResponse(data: unknown): data is CertificateRequestSuccess {
  return Boolean(
    data &&
      typeof data === "object" &&
      "status" in data &&
      data.status === "success" &&
      "download_url" in data,
  );
}

function closeStream(streamRef: MutableRefObject<EventSource | null>) {
  streamRef.current?.close();
  streamRef.current = null;
}
