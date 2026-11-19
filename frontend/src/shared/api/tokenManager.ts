let inMemoryAccessToken: string | null = null;
let onSessionExpiredCallback: (() => void) | null = null;

export const tokenManager = {
  getToken: () => inMemoryAccessToken,
  setToken: (token: string | null) => {
    inMemoryAccessToken = token;
  },

  onSessionExpired: (callback: () => void) => {
    onSessionExpiredCallback = callback;
  },
  triggerSessionExpired: () => {
    if (onSessionExpiredCallback) onSessionExpiredCallback();
  },
};
