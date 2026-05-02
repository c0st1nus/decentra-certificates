"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useTelegram } from "@/components/telegram-provider";
import { useTelegramLogin } from "@/hooks/use-telegram-login";
import { type TelegramAuthPayload, getTelegramSettings, verifySubscription } from "@/lib/api";
import { cn } from "@/lib/utils";

type SubscriptionStatus = "idle" | "checking" | "subscribed" | "not_subscribed" | "error";

interface TelegramSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (auth: TelegramAuthPayload) => void;
}

export function TelegramSubscriptionModal({
  open,
  onClose,
  onVerified,
}: TelegramSubscriptionModalProps) {
  const { isTma, initData, openChannel } = useTelegram();
  const [settings, setSettings] = useState<{ channelUrl: string; clientId: string | null } | null>(
    null,
  );
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setStatus("idle");
    setSettings(null);
    setErrorMessage(null);
    setSettingsError(null);
    setIsSettingsLoading(true);

    getTelegramSettings()
      .then(({ data, response }) => {
        if (cancelled) {
          return;
        }

        if (!response.ok || !data) {
          throw new Error("Настройки Telegram временно недоступны.");
        }

        setSettings({ channelUrl: data.channel_url, clientId: data.client_id });
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsError("Настройки входа через Telegram временно недоступны.");
          setSettings(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSettingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleVerify = useCallback(
    async (auth: TelegramAuthPayload) => {
      if (!auth.value.trim()) {
        setStatus("error");
        setErrorMessage(
          "Telegram не передал данные авторизации. Откройте страницу из кнопки бота или войдите через Telegram в браузере.",
        );
        return;
      }

      setStatus("checking");
      setErrorMessage(null);

      try {
        const { data, response } = await verifySubscription(auth);
        if (!response.ok || !data) {
          throw new Error(getVerificationErrorMessage(data));
        }

        if ("subscribed" in data && data.subscribed) {
          setStatus("subscribed");
          onVerified(auth);
        } else {
          setStatus("not_subscribed");
        }
      } catch (error) {
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Не удалось проверить подписку Telegram. Попробуйте ещё раз.",
        );
      }
    },
    [onVerified],
  );

  // Auto-verify in TMA on open
  useEffect(() => {
    if (open && isTma && initData && status === "idle") {
      void handleVerify({ auth_type: "init_data", value: initData });
    }
  }, [open, isTma, initData, status, handleVerify]);

  if (!open) return null;

  const channelUrl = settings?.channelUrl ?? "https://t.me/channelname";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-[#0d0d13] p-6 shadow-2xl">
        <button
          className="absolute right-4 top-4 text-white/40 transition-colors hover:text-white"
          type="button"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>

        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 size-6 text-primary" />
          <div>
            <h3 className="text-lg font-bold text-white">Подпишитесь на канал</h3>
            <p className="mt-1 text-sm leading-6 text-white/60">
              Чтобы получить сертификат, нужно быть подписанным на наш Telegram-канал.
            </p>
          </div>
        </div>

        {isTma ? (
          <TmaFlow
            channelUrl={channelUrl}
            errorMessage={errorMessage}
            handleVerify={handleVerify}
            openChannel={openChannel}
            status={status}
          />
        ) : (
          <BrowserFlow
            channelUrl={channelUrl}
            clientId={isSettingsLoading ? undefined : (settings?.clientId ?? null)}
            errorMessage={errorMessage ?? settingsError}
            handleVerify={handleVerify}
            isSettingsLoading={isSettingsLoading}
            status={status}
          />
        )}
      </div>
    </div>
  );
}

function TmaFlow({
  channelUrl,
  errorMessage,
  handleVerify,
  openChannel,
  status,
}: {
  channelUrl: string;
  errorMessage: string | null;
  handleVerify: (auth: TelegramAuthPayload) => Promise<void>;
  openChannel: (url: string) => void;
  status: SubscriptionStatus;
}) {
  const isChecking = status === "checking";

  return (
    <div className="space-y-4">
      {status === "subscribed" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 p-4 text-sm text-primary">
          <CheckCircle2 className="size-5" />
          <span>Подписка подтверждена. Теперь можно получить сертификат.</span>
        </div>
      ) : (
        <>
          <button
            className="btn-hero w-full rounded-2xl border border-primary/25 bg-primary/10 text-primary"
            disabled={isChecking}
            type="button"
            onClick={() => openChannel(channelUrl)}
          >
            <MessageCircle className="size-4" />
            Открыть канал в Telegram
          </button>

          {status === "checking" && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              Проверяем подписку...
            </div>
          )}

          {(status === "not_subscribed" || status === "error") && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {status === "not_subscribed"
                    ? "Подписка не найдена. Подпишитесь на канал и попробуйте ещё раз."
                    : (errorMessage ??
                      "Не удалось проверить подписку Telegram. Попробуйте ещё раз.")}
                </span>
              </div>
              <button
                className="btn-hero w-full rounded-2xl border border-white/10 bg-white/[0.04]"
                disabled={isChecking}
                type="button"
                onClick={() => {
                  void handleVerify({
                    auth_type: "init_data",
                    value: window.Telegram?.WebApp?.initData ?? "",
                  });
                }}
              >
                <CheckCircle2 className="size-4" />Я подписался, проверить ещё раз
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BrowserFlow({
  channelUrl,
  clientId,
  errorMessage,
  handleVerify,
  isSettingsLoading,
  status,
}: {
  channelUrl: string;
  clientId: string | null | undefined;
  errorMessage: string | null;
  handleVerify: (auth: TelegramAuthPayload) => Promise<void>;
  isSettingsLoading: boolean;
  status: SubscriptionStatus;
}) {
  const [sdkState, setSdkState] = useState<"loading" | "ready" | "timeout">("loading");
  const { ready, login } = useTelegramLogin(clientId, {
    onSuccess: (idToken) => {
      handleVerify({ auth_type: "id_token", value: idToken });
    },
    onError: () => {
      setSdkState("timeout");
    },
  });

  useEffect(() => {
    if (isSettingsLoading) {
      setSdkState("loading");
      return;
    }

    if (ready) {
      setSdkState("ready");
      return;
    }

    const timer = setTimeout(() => {
      setSdkState((prev) => (prev === "loading" ? "timeout" : prev));
    }, 5000);

    return () => clearTimeout(timer);
  }, [isSettingsLoading, ready]);

  if (isSettingsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/60">
        <LoaderCircle className="size-4 motion-safe:animate-spin" />
        Загружаем вход через Telegram...
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>{errorMessage ?? "Ошибка настройки: вход через Telegram не настроен."}</span>
      </div>
    );
  }

  const canLogin = ready && Boolean(clientId);

  return (
    <div className="space-y-4">
      {status === "subscribed" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 p-4 text-sm text-primary">
          <CheckCircle2 className="size-5" />
          <span>Telegram проверен, подписка подтверждена.</span>
        </div>
      ) : (
        <>
          <button
            className={cn(
              "btn-hero w-full rounded-2xl border border-primary/25 bg-primary/10 text-primary",
              !canLogin && "cursor-not-allowed opacity-60",
            )}
            disabled={!canLogin}
            type="button"
            onClick={login}
          >
            <MessageCircle className="size-4" />
            Войти через Telegram
          </button>

          {sdkState === "loading" && !ready && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              Готовим вход через Telegram...
            </div>
          )}

          {sdkState === "timeout" && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                Вход через Telegram временно недоступен. Попробуйте позже или откройте страницу из
                приложения Telegram.
              </span>
            </div>
          )}

          <p className="text-center text-xs text-white/40">
            После входа мы автоматически проверим подписку на канал.
          </p>

          {status === "checking" && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              Проверяем подписку...
            </div>
          )}

          {status === "not_subscribed" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>Вы не подписаны на канал. Подпишитесь и войдите ещё раз.</span>
              </div>
              <a
                className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-2"
                href={channelUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Открыть канал
              </a>
            </div>
          )}

          {status === "error" && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                {errorMessage ?? "Не удалось проверить подписку Telegram. Попробуйте ещё раз."}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getVerificationErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string" &&
    data.message.trim().length > 0
  ) {
    return data.message;
  }

  return "Не удалось проверить подписку Telegram. Попробуйте ещё раз.";
}
