"use client";

import { AlertCircle, LoaderCircle, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { useTelegram } from "@/components/telegram-provider";
import { useTelegramLogin } from "@/hooks/use-telegram-login";
import { type TelegramAuthPayload, getTelegramSettings } from "@/lib/api";
import { authenticateGame, getStoredGameSession, setGameSession } from "@/lib/game-api";
import { cn } from "@/lib/utils";

type AuthStatus = "checking" | "authenticated" | "idle" | "authenticating" | "error";

interface GameAuthGateProps {
  children: ReactNode;
}

export function GameAuthGate({ children }: GameAuthGateProps) {
  const { initData, isTma, telegramUser } = useTelegram();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [clientId, setClientId] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const completeAuth = useCallback(async (telegramAuth: TelegramAuthPayload) => {
    if (!telegramAuth.value.trim()) {
      setStatus("error");
      setErrorMessage("Telegram не передал данные авторизации. Откройте игру через Telegram.");
      return;
    }

    setStatus("authenticating");
    setErrorMessage(null);

    try {
      const { data, response } = await authenticateGame(telegramAuth);
      const session = data ? setGameSession(data) : null;
      if (!response.ok || !session) {
        throw new Error("Не удалось получить игровой токен.");
      }
      setStatus("authenticated");
    } catch {
      setStatus("error");
      setErrorMessage("Не удалось войти через Telegram. Попробуйте ещё раз.");
    }
  }, []);

  const { login, ready } = useTelegramLogin(clientId, {
    onError: () => {
      setStatus("error");
      setErrorMessage("Telegram Login временно недоступен. Попробуйте открыть игру из Telegram.");
    },
    onSuccess: (idToken) => {
      void completeAuth({ auth_type: "id_token", value: idToken });
    },
  });

  useEffect(() => {
    const session = getStoredGameSession();
    if (session) {
      setStatus("authenticated");
      return;
    }

    setStatus("idle");
  }, []);

  useEffect(() => {
    if (!isTma || !initData || status !== "idle") {
      return;
    }

    void completeAuth({ auth_type: "init_data", value: initData });
  }, [completeAuth, initData, isTma, status]);

  useEffect(() => {
    let cancelled = false;

    getTelegramSettings()
      .then(({ data, response }) => {
        if (cancelled) return;
        if (response.ok && data?.client_id) {
          setClientId(data.client_id);
        }
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "authenticated") {
    return <>{children}</>;
  }

  return (
    <section className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center justify-center py-12">
      <div className="admin-panel w-full text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-3xl border border-primary/25 bg-primary/10">
          <MessageCircle className="size-6 text-primary" />
        </div>
        <p className="admin-eyebrow mt-5">Telegram auth</p>
        <h1 className="mt-3 text-3xl font-black text-white">Войдите, чтобы играть</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/65">
          Результаты Tetris сохраняются в личном профиле и попадают в лидерборд только после
          авторизации через Telegram.
        </p>

        {telegramUser ? (
          <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
            Telegram: @{telegramUser.username ?? telegramUser.firstName ?? telegramUser.id}
          </p>
        ) : null}

        <div className="mt-6 space-y-3">
          {status === "checking" || status === "authenticating" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-white/65">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              {status === "checking" ? "Проверяем игровую сессию..." : "Авторизуем игру..."}
            </div>
          ) : null}

          {status === "error" && errorMessage ? (
            <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-left text-sm text-red-100">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <button
            className={cn(
              "btn-hero glow-primary rounded-2xl bg-primary/15 text-primary",
              (!ready || !clientId || settingsLoading || status === "authenticating") &&
                "cursor-not-allowed opacity-60",
            )}
            disabled={!ready || !clientId || settingsLoading || status === "authenticating"}
            type="button"
            onClick={login}
          >
            <MessageCircle className="size-4" />
            Войти через Telegram
          </button>

          {!clientId && !settingsLoading && !isTma ? (
            <p className="text-xs leading-5 text-white/45">
              Вход через браузер будет доступен после настройки Telegram client_id на сервере.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
