import axios, {
  type AxiosInstance,
  AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';

import {
  API_TIMEOUT_MS,
  API_URL,
  APP_HEADER,
  APP_HEADER_VALUE,
} from './constants';
import { tokenManager } from './tokenManager';

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _isRetry?: boolean;
}

export const setupInterceptors = (apiInstance: AxiosInstance) => {
  apiInstance.interceptors.request.use(config => {
    config.headers.set(APP_HEADER, APP_HEADER_VALUE);

    const token = tokenManager.getToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  apiInstance.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as
        | CustomAxiosRequestConfig
        | undefined;

      const isAuthCall = /\/(auth\/login|refresh)$/.test(
        originalRequest?.url ?? ''
      );

      if (
        !originalRequest ||
        error.response?.status !== 401 ||
        originalRequest._isRetry ||
        isAuthCall
      ) {
        return Promise.reject(error);
      }

      if (tokenManager.getIsRefreshing()) {
        try {
          const newToken = await tokenManager.addRequestToQueue();
          originalRequest._isRetry = true;
          originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
          return apiInstance(originalRequest);
        } catch (err) {
          const queueError =
            err instanceof Error ? err : new Error(String(err));
          return Promise.reject(queueError);
        }
      }

      originalRequest._isRetry = true;
      tokenManager.setIsRefreshing(true);

      try {
        const { data } = await axios.post<{ accessToken: string }>(
          `${API_URL}/refresh`,
          {},
          {
            withCredentials: true,
            timeout: API_TIMEOUT_MS,
            headers: { [APP_HEADER]: APP_HEADER_VALUE },
          }
        );

        tokenManager.setToken(data.accessToken);
        tokenManager.processQueue(null, data.accessToken);

        originalRequest.headers.set(
          'Authorization',
          `Bearer ${data.accessToken}`
        );
        return apiInstance(originalRequest);
      } catch (refreshError) {
        tokenManager.setToken(null);

        const finalError =
          refreshError instanceof Error || refreshError instanceof AxiosError
            ? refreshError
            : new Error(String(refreshError));

        tokenManager.processQueue(finalError, null);
        tokenManager.triggerSessionExpired();

        return Promise.reject(finalError);
      } finally {
        tokenManager.setIsRefreshing(false);
      }
    }
  );
};
