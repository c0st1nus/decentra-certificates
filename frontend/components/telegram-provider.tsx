"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
}

const TelegramContext = createContext<TelegramContextValue>({
  isTma: false,
  initData: null,
  telegramUser: null,
  ready: () => {},
  expand: () => {},
  openChannel: () => {},
});

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [isTma, setIsTma] = useState(false);
  const [initData, setInitData] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<TelegramContextValue["telegramUser"]>(null);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
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
    }
  }, []);

  const ready = useCallback(() => {
    window.Telegram?.WebApp?.ready();
  }, []);

  const expand = useCallback(() => {
    window.Telegram?.WebApp?.expand();
  }, []);

  const openChannel = useCallback((url: string) => {
    window.Telegram?.WebApp?.openTelegramLink(url);
  }, []);

  const value = useMemo(
    () => ({ isTma, initData, telegramUser, ready, expand, openChannel }),
    [isTma, initData, telegramUser, ready, expand, openChannel],
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  return useContext(TelegramContext);
}
