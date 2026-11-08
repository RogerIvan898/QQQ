import { api } from 'shared/api/axios';

export interface Profile {
  id: string;
  /** Shown at the table and in the menu; set by the player in Settings. */
  nickname: string;
}

export const authApi = {
  login: (initData: string) => api.post<null>('/auth/login', { initData }),
  getMe: () => api.get<Profile>('/auth/me'),
  updateNickname: (nickname: string) =>
    api.post<Pick<Profile, 'nickname'>>('/profile/nickname', { nickname }),
};
