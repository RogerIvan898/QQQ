import { api, ApiError } from 'shared/api';
import { isRecord } from 'shared/utils/validation';

export interface SessionUser {
  id: string;
}

export interface LoginResponse {
  accessToken?: string;
  user: SessionUser;
}

const parseUser = (value: unknown): SessionUser => {
  if (!isRecord(value)) throw new ApiError('bad_response', null);

  const { id } = value;
  if (typeof id === 'string' && id.trim()) return { id };
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
    return { id: String(id) };
  }

  throw new ApiError('bad_response', null);
};

export const authApi = {
  login: async (initData: string): Promise<LoginResponse> => {
    const value = await api.post('/auth/login', { initData });

    if (
      !isRecord(value) ||
      (value.accessToken !== undefined && typeof value.accessToken !== 'string')
    ) {
      throw new ApiError('bad_response', null);
    }

    return {
      user: parseUser(value.user),
      accessToken: value.accessToken || undefined,
    };
  },
  getMe: () => api.get('/auth/me').then(parseUser),
};
