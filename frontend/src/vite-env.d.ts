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
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            photo_url?: string;
          };
        };
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        requestFullscreen: () => void;
        version: string;
        isVersionAtLeast: (version: string) => boolean;
        enableClosingConfirmation: () => void;
        disableClosingConfirmation: () => void;
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        safeAreaInset?: TelegramSafeAreaInset;
        contentSafeAreaInset?: TelegramSafeAreaInset;
        onEvent: (event: string, callback: () => void) => void;
        offEvent: (event: string, callback: () => void) => void;
      };
    };
  }

  interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_MOCK_SERVER?: string;
  }
}

export {};
