"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TELEGRAM_LOGIN_SCRIPT = "https://telegram.org/js/telegram-login.js";

interface TelegramLoginCallbacks {
  onSuccess?: (idToken: string) => void;
  onError?: (error: string) => void;
}

interface TelegramLoginSdk {
  init: (
    options: { client_id: number; request_access?: string[]; nonce?: string },
    callback: (result: { id_token?: string; error?: string }) => void,
  ) => void;
  open: (callback?: (result: { id_token?: string; error?: string }) => void) => void;
  auth: (
    options: { client_id: number; request_access?: string[]; nonce?: string },
    callback: (result: { id_token?: string; error?: string }) => void,
  ) => void;
}

export function useTelegramLogin(
  clientId: string | null | undefined,
  callbacks?: TelegramLoginCallbacks,
) {
  const [ready, setReady] = useState(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Telegram?.Login) {
      setReady(true);
      return;
    }

    const existing = document.querySelector(`script[src="${TELEGRAM_LOGIN_SCRIPT}"]`);
    if (existing) {
      const check = () => {
        if (window.Telegram?.Login) {
          setReady(true);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
      return;
    }

    const script = document.createElement("script");
    script.src = TELEGRAM_LOGIN_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.Telegram?.Login) {
        setReady(true);
      }
    };
    script.onerror = () => {
      callbacksRef.current?.onError?.("failed to load Telegram Login SDK");
    };
    document.body.appendChild(script);
  }, []);

  const login = useCallback(() => {
    if (!window.Telegram?.Login || !clientId) {
      callbacksRef.current?.onError?.("Telegram Login SDK not ready or CLIENT_ID missing");
      return;
    }

    const clientIdNum = Number(clientId);
    if (!Number.isFinite(clientIdNum)) {
      callbacksRef.current?.onError?.("invalid TELEGRAM_CLIENT_ID");
      return;
    }

    window.Telegram.Login.auth(
      {
        client_id: clientIdNum,
        request_access: ["write"],
      },
      (result) => {
        if (result.error) {
          callbacksRef.current?.onError?.(result.error);
        } else if (result.id_token) {
          callbacksRef.current?.onSuccess?.(result.id_token);
        } else {
          callbacksRef.current?.onError?.("unexpected response from Telegram Login");
        }
      },
    );
  }, [clientId]);

  return { ready, login };
}
