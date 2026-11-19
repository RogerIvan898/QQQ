import { api, expectResponse } from 'shared/api';
import { isFiniteNumber, isRecord } from 'shared/utils/validation';

import type { JoinRoomResponse, RoomListItem } from '../model';

const isRoom = (value: unknown): value is RoomListItem =>
  isRecord(value) &&
  isFiniteNumber(value.id) &&
  typeof value.name === 'string' &&
  (value.mode === 'cash' || value.mode === 'heads-up') &&
  (value.game === undefined || value.game === 'nlh' || value.game === 'plo') &&
  typeof value.blinds === 'string' &&
  isFiniteNumber(value.players) &&
  isFiniteNumber(value.max) &&
  isFiniteNumber(value.minBuy) &&
  isFiniteNumber(value.maxBuy);

const isRoomList = (value: unknown): value is RoomListItem[] =>
  Array.isArray(value) && value.every(isRoom);

const isJoinResponse = (value: unknown): value is JoinRoomResponse =>
  isRecord(value) &&
  typeof value.wsUrl === 'string' &&
  value.wsUrl.length > 0 &&
  isFiniteNumber(value.expiresIn) &&
  (value.ticket === undefined || typeof value.ticket === 'string');

export const roomApi = {
  list: async () => expectResponse(await api.get('/rooms'), isRoomList),
  join: async (roomId: string) =>
    expectResponse(await api.get(`/room/${roomId}/join`), isJoinResponse),
};
