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

import { AdminPanel } from "@/components/admin-panel";
import { CertificateDownloadButton } from "@/components/certificate-download-button";
import { useTelegram } from "@/components/telegram-provider";
import { TelegramSubscriptionModal } from "@/components/telegram-subscription-modal";
import {
  type AvailableCertificate,
  type CertificateJobStatus,
  type CertificateRequestQueued,
  type CertificateRequestSuccess,
  type TelegramAuthPayload,
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
  | {
      kind: "select";
      certificates: AvailableCertificate[];
      fullName: string | null;
    }
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
  | { kind: "not_subscribed"; message: string }
  | { kind: "error"; message: string };

const initialMessage =
  "Введите email, который использовали при регистрации. Мы покажем доступные сертификаты и запустим генерацию, если PDF ещё не готов.";

export function EmailRequestForm() {
  const { initData, isTma } = useTelegram();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<RequestState>({ kind: "idle" });
  const [telegramAuth, setTelegramAuth] = useState<TelegramAuthPayload | undefined>(undefined);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [pendingCertificate, setPendingCertificate] = useState<AvailableCertificate | undefined>(
    undefined,
  );
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      closeStream(streamRef);
    };
  }, []);

  function handleNotSubscribed() {
    setState({
      kind: "not_subscribed",
      message: "Чтобы получить сертификат, нужно быть подписанным на наш Telegram-канал.",
    });
    window.setTimeout(() => setShowSubscriptionModal(true), 0);
  }

  function getActiveTelegramAuth(auth?: TelegramAuthPayload) {
    if (auth) {
      return auth;
    }

    if (telegramAuth) {
      return telegramAuth;
    }

    if (isTma && initData) {
      return { auth_type: "init_data", value: initData } satisfies TelegramAuthPayload;
    }

    return undefined;
  }

  async function retryAfterVerification(auth: TelegramAuthPayload) {
    setTelegramAuth(auth);
    setShowSubscriptionModal(false);
    toast.success("Подписка на Telegram-канал подтверждена");

    if (pendingCertificate) {
      setPendingCertificate(undefined);
      await handleRequestCertificate(pendingCertificate, auth);
    } else {
      await submitAgain(auth);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await checkEmail();
  }

  async function checkEmail(auth?: TelegramAuthPayload) {
    const activeTelegramAuth = getActiveTelegramAuth(auth);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setState({ kind: "error", message: "Введите email, чтобы продолжить." });
      return;
    }

    closeStream(streamRef);
    setState({ kind: "checking" });

    try {
      const { data, response } = await checkCertificates(normalizedEmail, activeTelegramAuth);

      if (!response.ok || !data) {
        if (response.status === 403) {
          const msg =
            data && "message" in data && typeof data.message === "string" ? data.message : "";
          if (msg === "not_subscribed_to_channel") {
            handleNotSubscribed();
            return;
          }
          setState({
            kind: "issuance_disabled",
            message: "Выдача сертификатов пока не открыта.",
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

        const message =
          data && "message" in data && typeof data.message === "string"
            ? data.message
            : "Что-то пошло не так. Попробуйте ещё раз позже.";
        setState({ kind: "error", message });
        return;
      }

      if (data.certificates.length === 0) {
        setState({
          kind: "not_found",
          message: "Этот email не найден в базе участников.",
        });
        return;
      }

      setState({
        kind: "select",
        certificates: data.certificates,
        fullName: data.full_name,
      });
    } catch {
      setState({
        kind: "error",
        message: "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.",
      });
    }
  }

  async function handleRequestCertificate(
    certificate: AvailableCertificate,
    auth?: TelegramAuthPayload,
  ) {
    closeStream(streamRef);
    setState({ kind: "requesting", certificate });

    try {
      const { data, response } = await requestCertificate(
        email.trim(),
        certificate.template_id,
        getActiveTelegramAuth(auth),
      );

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
        if (message === "not_subscribed_to_channel") {
          setPendingCertificate(certificate);
          handleNotSubscribed();
        } else {
          setState({
            kind: "issuance_disabled",
            message: "Certificate issuance is not open yet.",
          });
        }
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
        setState({
          kind: "success",
          payload: normalizeCompletedJob({
            ...parsed,
            download_url: parsed.download_url,
            verification_url: parsed.verification_url,
          }),
        });
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
          "Соединение с очередью генерации потеряно. Повторите запрос, и мы снова поднимем сертификат в очереди.",
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

  async function submitAgain(auth?: TelegramAuthPayload) {
    const form = document.getElementById("certificate-request-form");
    if (form instanceof HTMLFormElement) {
      if (!form.reportValidity()) {
        return;
      }
    }

    await checkEmail(auth);
  }

  const isChecking = state.kind === "checking";
  const isRequesting = state.kind === "requesting";
  const isWaiting = state.kind === "waiting";
  const isLoading = isChecking || isRequesting || isWaiting;

  return (
    <AdminPanel as="section">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Выдача сертификата</p>
          <h2 className="mt-3 text-2xl font-black text-white">Найти сертификат</h2>
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
          Email участника
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
              "admin-input admin-input-icon transition-colors",
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

        <button className="btn-hero glow-primary w-full rounded-2xl bg-white/5" type="submit">
          {isChecking ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              Проверяем email
            </>
          ) : (
            <>
              <span>Найти сертификаты</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </>
          )}
        </button>
      </form>

      <div
        aria-live="polite"
        className={cn(
          "mt-5 rounded-2xl border p-4",
          state.kind === "idle" && "border-white/10 bg-white/3 text-white/70",
          state.kind === "checking" && "border-primary/25 bg-primary/8 text-white/80",
          state.kind === "select" && "border-primary/30 bg-primary/10 text-white",
          (state.kind === "requesting" || state.kind === "waiting") &&
            "border-primary/25 bg-primary/8 text-white/80",
          state.kind === "success" && "border-primary/30 bg-primary/10 text-white",
          state.kind === "issuance_disabled" &&
            "border-amber-500/25 bg-amber-500/10 text-amber-100",
          state.kind === "not_found" && "border-white/10 bg-white/3 text-white/75",
          state.kind === "not_subscribed" && "border-red-500/25 bg-red-500/10 text-red-100",
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
            title="Выдача закрыта"
          />
        )}

        {state.kind === "not_found" && (
          <StatusNotice
            action={
              <button
                className="btn-hero mt-4 w-full rounded-2xl border border-white/10 bg-white/4"
                type="button"
                onClick={retry}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Попробовать снова
              </button>
            }
            icon={<AlertTriangle aria-hidden="true" className="size-5 text-white/90" />}
            message={state.message}
            title="Email не найден"
          />
        )}

        {state.kind === "not_subscribed" && (
          <StatusNotice
            action={
              <button
                className="btn-hero mt-4 w-full rounded-2xl border border-white/10 bg-white/4"
                type="button"
                onClick={() => setShowSubscriptionModal(true)}
              >
                <ShieldCheck aria-hidden="true" className="size-4" />
                Проверить подписку Telegram
              </button>
            }
            icon={<AlertTriangle aria-hidden="true" className="size-5 text-red-200" />}
            message={state.message}
            title="Нужна подписка"
          />
        )}

        {state.kind === "rate_limited" && (
          <StatusNotice
            action={
              <button
                className="btn-hero mt-4 w-full rounded-2xl border border-white/10 bg-white/4"
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
                className="btn-hero mt-4 w-full rounded-2xl border border-white/10 bg-white/4"
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

      <TelegramSubscriptionModal
        open={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onVerified={(auth) => void retryAfterVerification(auth)}
      />
    </AdminPanel>
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
            Найдено
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            {fullName ? `Сертификаты для ${fullName}` : "Доступные сертификаты"}
          </p>
          <p className="mt-1 text-sm leading-6 text-white/70">
            Готовые сертификаты можно скачать сразу. Если PDF ещё не создан, мы поставим его в
            приоритетную очередь.
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
                      <p className="text-xs text-white/50">Категория: {certificate.category}</p>
                    )}
                  </div>

                  <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70">
                    <span className={cn("size-2 rounded-full", statusMeta.dotClassName)} />
                    {statusMeta.label}
                  </span>
                </div>

                {certificate.download_url ? (
                  <CertificateDownloadButton
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary transition-colors hover:border-primary/40 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    href={buildApiUrl(certificate.download_url)}
                  >
                    <Download aria-hidden="true" className="size-3.5" />
                    Скачать PDF
                  </CertificateDownloadButton>
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">Статус</p>
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
          Проверяем участника
        </p>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/8 motion-reduce:animate-none" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/8 motion-reduce:animate-none" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-white/8 motion-reduce:animate-none" />
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
          Запускаем очередь
        </p>
      </div>
      <p className="text-sm text-white/70">
        Резервируем сертификат для шаблона &quot;{templateName}&quot; и поднимаем задачу в
        приоритетную очередь.
      </p>
    </div>
  );
}

function StatusWaiting({
  state,
}: {
  state: Extract<RequestState, { kind: "waiting" }>;
}) {
  const isConnecting = state.phase === "connecting";
  const isProcessing = state.phase === "processing";
  const stepClassName = isProcessing ? "bg-primary text-black" : "bg-white/[0.06] text-white/70";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-0.5 size-5 text-primary" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Очередь активна
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            Генерируем сертификат для {state.fullName}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/70">{state.message}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ProgressStep active title="Запрос принят" />
        <ProgressStep active={!isConnecting} title="Очередь подключена" />
        <ProgressStep active={isProcessing} title="PDF генерируется" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MetaPill label="ID сертификата" value={state.certificateId} mono />
        <MetaPill label="Шаблон" value={state.templateName} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-primary">
          <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          <p className="text-sm font-medium text-white">
            {isProcessing ? "Собираем PNG и PDF на сервере" : "Ждём свободный обработчик"}
          </p>
        </div>
        <div className="mt-3 grid gap-2">
          <div className={cn("h-2 rounded-full", stepClassName)} />
          <div className="h-2 w-4/5 rounded-full bg-white/8" />
          <div className="h-2 w-3/5 rounded-full bg-white/8" />
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
            Готово
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            Сертификат готов для {data.fullName}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/70">
            {data.message} Шаблон: {data.templateName}.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MetaPill label="ID сертификата" value={data.certificateId} mono />
        <MetaPill
          label="Код проверки"
          value={data.verificationCode ?? "Откройте ссылку проверки"}
          mono={Boolean(data.verificationCode)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <CertificateDownloadButton
          className="btn-hero glow-primary rounded-2xl bg-white/6"
          href={downloadHref}
        >
          <Download aria-hidden="true" className="size-4" />
          Скачать PDF
        </CertificateDownloadButton>
        <a
          className="btn-hero rounded-2xl border border-white/10 bg-white/4"
          href={verificationHref}
        >
          <BadgeCheck aria-hidden="true" className="size-4" />
          Проверить сертификат
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
          : "border-white/10 bg-white/3 text-white/55",
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
        action: "Скачать PDF",
        dotClassName: "bg-primary",
        icon: <Download aria-hidden="true" className="size-3.5" />,
        label: "Готов к скачиванию",
      };
    case "queued":
      return {
        action: "Поднять в очереди",
        dotClassName: "bg-amber-300",
        icon: <Sparkles aria-hidden="true" className="size-3.5" />,
        label: "Уже в очереди",
      };
    case "processing":
      return {
        action: "Смотреть генерацию",
        dotClassName: "bg-primary",
        icon: <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />,
        label: "Генерируется сейчас",
      };
    case "failed":
      return {
        action: "Запустить заново",
        dotClassName: "bg-red-300",
        icon: <RefreshCw aria-hidden="true" className="size-3.5" />,
        label: "Прошлая генерация упала",
      };
    default:
      return {
        action: "Сгенерировать",
        dotClassName: "bg-white/60",
        icon: <ArrowRight aria-hidden="true" className="size-3.5" />,
        label: "Ещё не создан",
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

function normalizeCompletedJob(
  data: CertificateJobStatus & { download_url: string; verification_url: string },
): SuccessPayload {
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
