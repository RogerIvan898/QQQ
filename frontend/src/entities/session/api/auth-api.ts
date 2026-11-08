import { api } from 'shared/api';

export interface SessionUser {
  id: string;
}

export interface LoginResponse {
  /** Bearer token for REST; may be omitted if the backend uses a cookie. */
  accessToken?: string;
  user: SessionUser;
}

export const authApi = {
  /** Telegram `initData` (validated on the server) → session. */
  login: (initData: string) =>
    api.post<LoginResponse>('/auth/login', { initData }),
  getMe: () => api.get<SessionUser>('/auth/me'),
};
