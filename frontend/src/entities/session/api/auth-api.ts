import { api } from 'shared/api';

export interface SessionUser {
  id: string;
}

export interface LoginResponse {
  accessToken?: string;
  user: SessionUser;
}

export const authApi = {
  login: (initData: string) =>
    api.post<LoginResponse>('/auth/login', { initData }),
  getMe: () => api.get<SessionUser>('/auth/me'),
};
