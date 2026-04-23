"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useTelegram } from "@/components/telegram-provider";
import { useTelegramLogin } from "@/hooks/use-telegram-login";
import { buildApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHANNEL_URL = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL ?? "https://t.me/channelname";

interface ChannelSubscriptionBlockProps {
  onSubscriptionVerified: (auth: { auth_type: string; value: string }) => void;
  onSubscriptionLost?: () => void;
}

export function ChannelSubscriptionBlock({
  onSubscriptionVerified,
  onSubscriptionLost,
}: ChannelSubscriptionBlockProps) {
  const { isTma, initData, openChannel } = useTelegram();
  const [status, setStatus] = useState<"idle" | "checking" | "subscribed" | "not_subscribed">(
    "idle",
  );
  const [checked, setChecked] = useState(false);

  const verifySubscription = useCallback(
    async (auth: { auth_type: string; value: string }) => {
      setStatus("checking");
      try {
        const res = await fetch(buildApiUrl("/api/v1/public/telegram/verify-subscription"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegram_auth: auth }),
        });
        const data = await res.json();
        if (data.subscribed) {
          setStatus("subscribed");
          onSubscriptionVerified(auth);
        } else {
          setStatus("not_subscribed");
          onSubscriptionLost?.();
        }
      } catch {
        setStatus("not_subscribed");
        onSubscriptionLost?.();
      }
    },
    [onSubscriptionVerified, onSubscriptionLost],
  );

  // Auto-verify if we have initData in TMA
  useEffect(() => {
    if (isTma && initData) {
      verifySubscription({ auth_type: "init_data", value: initData });
    }
  }, [isTma, initData, verifySubscription]);

  if (isTma) {
    return (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 size-5 text-primary" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              Telegram channel
            </p>
            <p className="mt-1 text-sm leading-6 text-white/70">
              To receive your certificate, please subscribe to our Telegram channel.
            </p>
          </div>
        </div>

        {status === "subscribed" ? (
          <div className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="size-4" />
            <span>You are subscribed to the channel</span>
          </div>
        ) : (
          <>
            <button
              className="btn-hero w-full rounded-2xl border border-primary/25 bg-primary/10 text-primary"
              type="button"
              onClick={() => openChannel(CHANNEL_URL)}
            >
              <MessageCircle className="size-4" />
              Open channel in Telegram
            </button>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                checked={checked}
                className="size-4 rounded border-white/20 bg-black/35 text-primary focus:ring-primary"
                type="checkbox"
                onChange={(e) => {
                  setChecked(e.target.checked);
                  if (e.target.checked && initData) {
                    verifySubscription({ auth_type: "init_data", value: initData });
                  }
                }}
              />
              <span className="text-sm text-white/70">I have subscribed to the channel</span>
            </label>

            {status === "checking" && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <LoaderCircle className="size-4 motion-safe:animate-spin" />
                Checking subscription...
              </div>
            )}

            {status === "not_subscribed" && (
              <div className="flex items-center gap-2 text-sm text-red-300">
                <AlertCircle className="size-4" />
                Subscription not found. Please join the channel and try again.
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Browser flow
  return (
    <BrowserSubscriptionBlock
      onSubscriptionVerified={onSubscriptionVerified}
      onSubscriptionLost={onSubscriptionLost}
    />
  );
}

function BrowserSubscriptionBlock({
  onSubscriptionVerified,
  onSubscriptionLost,
}: ChannelSubscriptionBlockProps) {
  const [status, setStatus] = useState<"idle" | "checking" | "subscribed" | "not_subscribed">(
    "idle",
  );
  const [idToken, setIdToken] = useState<string | null>(null);

  const { ready, login } = useTelegramLogin({
    onSuccess: (token) => {
      setIdToken(token);
      handleVerify({ auth_type: "id_token", value: token });
    },
    onError: (err) => {
      console.error("Telegram login error:", err);
      setStatus("not_subscribed");
      onSubscriptionLost?.();
    },
  });

  const handleVerify = useCallback(
    async (auth: { auth_type: string; value: string }) => {
      setStatus("checking");
      try {
        const res = await fetch(buildApiUrl("/api/v1/public/telegram/verify-subscription"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegram_auth: auth }),
        });
        const data = await res.json();
        if (data.subscribed) {
          setStatus("subscribed");
          onSubscriptionVerified(auth);
        } else {
          setStatus("not_subscribed");
          onSubscriptionLost?.();
        }
      } catch {
        setStatus("not_subscribed");
        onSubscriptionLost?.();
      }
    },
    [onSubscriptionVerified, onSubscriptionLost],
  );

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-0.5 size-5 text-primary" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Telegram channel
          </p>
          <p className="mt-1 text-sm leading-6 text-white/70">
            To receive your certificate, please log in with Telegram and subscribe to our channel.
          </p>
        </div>
      </div>

      {status === "subscribed" ? (
        <div className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="size-4" />
          <span>Telegram verified and channel subscription confirmed</span>
        </div>
      ) : (
        <>
          <button
            className={cn(
              "btn-hero w-full rounded-2xl border border-primary/25 bg-primary/10 text-primary",
              !ready && "cursor-not-allowed opacity-60",
            )}
            disabled={!ready}
            type="button"
            onClick={login}
          >
            <MessageCircle className="size-4" />
            Log in with Telegram
          </button>

          {status === "checking" && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              Checking subscription...
            </div>
          )}

          {status === "not_subscribed" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-red-300">
                <AlertCircle className="size-4" />
                You are not subscribed to the channel.
              </div>
              <a
                className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-2"
                href={CHANNEL_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open channel and subscribe
              </a>
              {idToken && (
                <button
                  className="btn-hero mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] text-sm"
                  type="button"
                  onClick={() => handleVerify({ auth_type: "id_token", value: idToken })}
                >
                  Check again
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
