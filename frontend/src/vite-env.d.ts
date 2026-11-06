/// <reference types="vite/client" />

type TelegramSafeAreaInset = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initData: string;
        initDataUnsafe?: {
          user?: {
            language_code?: string;
          };
        };
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        requestFullscreen: () => void;
        safeAreaInset?: TelegramSafeAreaInset;
        contentSafeAreaInset?: TelegramSafeAreaInset;
        onEvent: (event: string, callback: () => void) => void;
        offEvent: (event: string, callback: () => void) => void;
      };
    };
  }

  interface ImportMetaEnv {
    readonly VITE_API_URL: string;
  }
}

export {};
