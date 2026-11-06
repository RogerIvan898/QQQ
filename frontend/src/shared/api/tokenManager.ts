import type { AxiosError } from 'axios';

type QueueItem = {
  resolve: (token: string) => void;
  reject: (error: Error | AxiosError) => void;
};

let inMemoryAccessToken: string | null = null;
let isRefreshing = false;
let failedQueue: QueueItem[] = [];
let onSessionExpiredCallback: (() => void) | null = null;

export const tokenManager = {
  getToken: () => inMemoryAccessToken,
  setToken: (token: string | null) => {
    inMemoryAccessToken = token;
  },

  getIsRefreshing: () => isRefreshing,
  setIsRefreshing: (state: boolean) => {
    isRefreshing = state;
  },

  onSessionExpired: (callback: () => void) => {
    onSessionExpiredCallback = callback;
  },
  triggerSessionExpired: () => {
    if (onSessionExpiredCallback) onSessionExpiredCallback();
  },

  addRequestToQueue: () => {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
  },

  processQueue: (
    error: Error | AxiosError | null,
    token: string | null = null
  ) => {
    failedQueue.forEach(prom => {
      if (error) prom.reject(error);
      else if (token) prom.resolve(token);
    });
    failedQueue = [];
  },
};
