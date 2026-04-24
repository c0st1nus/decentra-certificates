"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const TELEGRAM_WEB_APP_SCRIPT = "https://telegram.org/js/telegram-web-app.js?62";
const TELEGRAM_WEB_APP_SCRIPT_ID = "telegram-web-app-sdk";

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
  ready: () => void;
  expand: () => void;
  isExpanded: boolean;
  platform: string;
  version: string;
  openTelegramLink: (url: string) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: { id: string; text: string }[];
  }) => void;
}

interface TelegramContextValue {
  isTma: boolean;
  initData: string | null;
  telegramUser: { id: number; username?: string; firstName?: string; lastName?: string } | null;
  ready: () => void;
  expand: () => void;
  openChannel: (url: string) => void;
  openLink: (url: string) => void;
}

const TelegramContext = createContext<TelegramContextValue>({
  isTma: false,
  initData: null,
  telegramUser: null,
  ready: () => {},
  expand: () => {},
  openChannel: () => {},
  openLink: () => {},
});

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [isTma, setIsTma] = useState(false);
  const [initData, setInitData] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<TelegramContextValue["telegramUser"]>(null);

  useEffect(() => {
    if (!hasTelegramBridge()) {
      return;
    }

    let cancelled = false;

    loadTelegramWebAppSdk()
      .then(() => {
        if (cancelled) {
          return;
        }

        const webApp = window.Telegram?.WebApp;
        if (!webApp || !isRealTelegramLaunch(webApp)) {
          return;
        }

        setIsTma(true);
        setInitData(webApp.initData);
        if (webApp.initDataUnsafe.user) {
          setTelegramUser({
            id: webApp.initDataUnsafe.user.id,
            username: webApp.initDataUnsafe.user.username,
            firstName: webApp.initDataUnsafe.user.first_name,
            lastName: webApp.initDataUnsafe.user.last_name,
          });
        }
        webApp.ready();
        if (!webApp.isExpanded) {
          webApp.expand();
        }
      })
      .catch(() => {
        setIsTma(false);
        setInitData(null);
        setTelegramUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const ready = useCallback(() => {
    window.Telegram?.WebApp?.ready();
  }, []);

  const expand = useCallback(() => {
    window.Telegram?.WebApp?.expand();
  }, []);

  const openChannel = useCallback((url: string) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp && isRealTelegramLaunch(webApp)) {
      webApp.openTelegramLink(url);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openLink = useCallback((url: string) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.openLink && isRealTelegramLaunch(webApp)) {
      webApp.openLink(url, { try_instant_view: false });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const value = useMemo(
    () => ({ isTma, initData, telegramUser, ready, expand, openChannel, openLink }),
    [isTma, initData, telegramUser, ready, expand, openChannel, openLink],
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  return useContext(TelegramContext);
}

function isRealTelegramLaunch(webApp: TelegramWebApp) {
  return (
    hasTelegramBridge() &&
    webApp.initData.trim().length > 0 &&
    webApp.platform !== "unknown" &&
    typeof webApp.initDataUnsafe?.user?.id === "number"
  );
}

function hasTelegramBridge() {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof window.TelegramWebviewProxy?.postEvent === "function") {
    return true;
  }

  const external = window.external as { notify?: unknown } | undefined;
  if (typeof external?.notify === "function") {
    return true;
  }

  return isTelegramWebIframe();
}

function isTelegramWebIframe() {
  try {
    return window.parent !== window && document.referrer.startsWith("https://web.telegram.org/");
  } catch {
    return false;
  }
}

function loadTelegramWebAppSdk() {
  if (window.Telegram?.WebApp) {
    return Promise.resolve();
  }

  const existing = document.getElementById(TELEGRAM_WEB_APP_SCRIPT_ID);
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Telegram WebApp SDK failed")), {
        once: true,
      });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = TELEGRAM_WEB_APP_SCRIPT_ID;
    script.src = TELEGRAM_WEB_APP_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Telegram WebApp SDK failed"));
    document.head.appendChild(script);
  });
}
