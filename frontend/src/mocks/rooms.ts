export interface MockRoomConfig {
  id: string;
  smallBlind: number;
  bigBlind: number;
  botCount: number;
}

const ROOMS: Record<string, MockRoomConfig> = {
  '1': { id: '1', smallBlind: 10, bigBlind: 20, botCount: 2 },
  '2': { id: '2', smallBlind: 100, bigBlind: 200, botCount: 3 },
  '3': { id: '3', smallBlind: 10, bigBlind: 20, botCount: 1 },
  '4': { id: '4', smallBlind: 5, bigBlind: 10, botCount: 2 },
  '5': { id: '5', smallBlind: 200, bigBlind: 400, botCount: 2 },
  '6': { id: '6', smallBlind: 500, bigBlind: 1000, botCount: 1 },
};

export const getMockRoom = (roomId: string): MockRoomConfig =>
  ROOMS[roomId] ?? {
    id: roomId,
    smallBlind: 10,
    bigBlind: 20,
    botCount: 2,
  };

export const buildMockWsUrl = (roomId: string): string => {
  const url = new URL(`/mock-ws/room/${roomId}`, window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  return url.toString();
};
