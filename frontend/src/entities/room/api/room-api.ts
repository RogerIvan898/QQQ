import { api } from 'shared/api';

import type { JoinRoomResponse, RoomListItem } from '../model';

export const roomApi = {
  list: () => api.get<RoomListItem[]>('/rooms'),
  join: (roomId: string) => api.get<JoinRoomResponse>(`/room/${roomId}/join`),
};
