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
          throw new Error("Telegram settings are temporarily unavailable.");
        }

        setSettings({ channelUrl: data.channel_url, clientId: data.client_id });
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsError("Telegram login settings are temporarily unavailable.");
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
          "Telegram did not provide authentication data. Open this page from the bot button or log in with Telegram in your browser.",
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
            : "Unable to verify Telegram subscription. Please try again.",
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
            <h3 className="text-lg font-bold text-white">Subscribe to our channel</h3>
            <p className="mt-1 text-sm leading-6 text-white/60">
              To claim your certificate, you need to be subscribed to our Telegram channel.
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
          <span>You are subscribed! You can now claim your certificate.</span>
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
            Open channel in Telegram
          </button>

          {status === "checking" && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              Checking subscription...
            </div>
          )}

          {(status === "not_subscribed" || status === "error") && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {status === "not_subscribed"
                    ? "Subscription not found. Please join the channel and try again."
                    : (errorMessage ?? "Unable to verify Telegram subscription. Please try again.")}
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
                <CheckCircle2 className="size-4" />I have subscribed — check again
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
        Loading Telegram login...
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>{errorMessage ?? "Configuration error: Telegram login is not set up."}</span>
      </div>
    );
  }

  const canLogin = ready && Boolean(clientId);

  return (
    <div className="space-y-4">
      {status === "subscribed" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 p-4 text-sm text-primary">
          <CheckCircle2 className="size-5" />
          <span>Telegram verified and subscription confirmed!</span>
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
            Log in with Telegram
          </button>

          {sdkState === "loading" && !ready && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              Preparing Telegram login...
            </div>
          )}

          {sdkState === "timeout" && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                Telegram login is temporarily unavailable. Please try again later or open this page
                from the Telegram app.
              </span>
            </div>
          )}

          <p className="text-center text-xs text-white/40">
            After logging in, we will check your channel subscription automatically.
          </p>

          {status === "checking" && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              Checking subscription...
            </div>
          )}

          {status === "not_subscribed" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  You are not subscribed to the channel. Please subscribe and log in again.
                </span>
              </div>
              <a
                className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-2"
                href={channelUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open channel
              </a>
            </div>
          )}

          {status === "error" && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                {errorMessage ?? "Unable to verify Telegram subscription. Please try again."}
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

  return "Unable to verify Telegram subscription. Please try again.";
}
