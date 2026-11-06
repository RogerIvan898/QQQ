import { api } from 'shared/api/axios';

import type { JoinRoomResponse } from '../model';

export const roomApi = {
  join: (roomId: string) => api.get<JoinRoomResponse>(`/room/${roomId}/join`),
};
