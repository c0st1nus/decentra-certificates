export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
      Login?: TelegramLoginSdk;
    };
  }
}

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
