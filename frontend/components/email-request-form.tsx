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
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";

import { type CertificateRequestSuccess, buildApiUrl, requestCertificate } from "@/lib/api";
import { cn } from "@/lib/utils";

type RequestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; payload: CertificateRequestSuccess }
  | { kind: "issuance_disabled"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "error"; message: string };

const initialMessage =
  "Введите e-mail, который использовался при регистрации. Мы покажем результат только после серверной проверки.";

export function EmailRequestForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<RequestState>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setState({ kind: "error", message: "Введите e-mail, чтобы продолжить." });
      return;
    }

    setState({ kind: "loading" });

    try {
      const { data, response } = await requestCertificate(normalizedEmail);

      if (response.ok && data && "status" in data) {
        setState({ kind: "success", payload: data });
        return;
      }

      const message =
        data && "message" in data ? data.message : "Произошла ошибка. Попробуйте позже.";

      if (response.status === 403) {
        setState({
          kind: "issuance_disabled",
          message: "Выдача сертификатов еще не открыта.",
        });
        return;
      }

      if (response.status === 404) {
        setState({
          kind: "not_found",
          message: "Данный e-mail не найден в базе участников.",
        });
        return;
      }

      if (response.status === 429) {
        setState({
          kind: "rate_limited",
          message: "Слишком много запросов. Подождите немного и попробуйте снова.",
        });
        return;
      }

      setState({ kind: "error", message });
    } catch {
      setState({
        kind: "error",
        message: "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.",
      });
    }
  }

  function retry() {
    if (!email.trim()) {
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

  const isLoading = state.kind === "loading";

  return (
    <section className="panel-glow rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Public issuance
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">Забрать сертификат</h2>
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
        <label className="block text-sm font-medium text-white/72" htmlFor="email">
          E-mail для сертификата
        </label>

        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65"
          />
          <input
            id="email"
            autoComplete="email"
            className={cn(
              "w-full rounded-2xl border border-white/10 bg-black/35 py-3.5 pl-11 pr-4 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40",
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
          {isLoading ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Проверяем e-mail
            </>
          ) : (
            <>
              <span>Забрать сертификат</span>
              <ArrowRight />
            </>
          )}
        </button>
      </form>

      <div
        aria-live="polite"
        className={cn(
          "mt-5 rounded-[1.5rem] border p-4",
          state.kind === "idle" && "border-white/10 bg-white/[0.03] text-white/70",
          state.kind === "loading" && "border-primary/25 bg-primary/[0.08] text-white/75",
          state.kind === "success" && "border-primary/30 bg-primary/10 text-white",
          state.kind === "issuance_disabled" &&
            "border-amber-500/25 bg-amber-500/10 text-amber-100",
          state.kind === "not_found" && "border-white/10 bg-white/[0.03] text-white/72",
          (state.kind === "rate_limited" || state.kind === "error") &&
            "border-red-500/25 bg-red-500/10 text-red-100",
        )}
      >
        {state.kind === "idle" && <StatusIdle message={initialMessage} />}

        {state.kind === "loading" && <StatusLoading />}

        {state.kind === "success" && <StatusSuccess data={state.payload} />}

        {state.kind === "issuance_disabled" && (
          <StatusNotice
            icon={<ShieldCheck aria-hidden="true" className="size-5 text-amber-300" />}
            message={state.message}
            title="Выдача отключена"
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
                Попробовать еще раз
              </button>
            }
            icon={<AlertTriangle aria-hidden="true" className="size-5 text-white/90" />}
            message={state.message}
            title="E-mail не найден"
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
                Повторить запрос
              </button>
            }
            icon={<AlertTriangle aria-hidden="true" className="size-5 text-red-200" />}
            message={state.message}
            title="Слишком много запросов"
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
                Повторить запрос
              </button>
            }
            icon={<AlertTriangle aria-hidden="true" className="size-5 text-red-200" />}
            message={state.message}
            title="Ошибка запроса"
          />
        )}
      </div>
    </section>
  );
}

function StatusIdle({ message }: { message: string }) {
  return (
    <div className="space-y-3">
      <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-white/45">Status</p>
      <p className="max-w-md text-sm leading-6 text-white/72">{message}</p>
    </div>
  );
}

function StatusLoading() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-primary">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary">
          Checking participant
        </p>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/[0.08]" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/[0.08]" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-white/[0.08]" />
      </div>
    </div>
  );
}

function StatusSuccess({ data }: { data: CertificateRequestSuccess }) {
  const downloadHref = buildApiUrl(data.download_url);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <BadgeCheck aria-hidden="true" className="mt-0.5 size-5 text-primary" />
        <div className="min-w-0">
          <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary">Success</p>
          <p className="mt-2 text-base font-semibold text-white">
            Сертификат готов для {data.full_name}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Шаблон {data.template_name}. Сертификат и verification code уже сохранены на сервере.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MetaPill label="Certificate ID" value={data.certificate_id} mono />
        <MetaPill label="Verification code" value={data.verification_code} mono />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <a className="btn-hero glow-primary rounded-2xl bg-white/[0.06]" href={downloadHref}>
          <Download aria-hidden="true" className="size-4" />
          Скачать PDF
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
          <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-white/45">
            {title}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/72">{message}</p>
        </div>
      </div>
      {action ? action : null}
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
      <p className="font-pixel text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className={cn("mt-2 text-sm text-white/78", mono && "font-mono text-[11px]")}>{value}</p>
    </div>
  );
}
