export interface MockRoomConfig {
  id: string;
  smallBlind: number;
  bigBlind: number;
  botCount: number;
  /** Dev scenario: `all-in` makes every bot shove each hand (equity testing). */
  scenario?: 'all-in';
}

// Blinds in chips, 1 chip = 0.01 TON (mirrors pages/main-menu ROOMS).
const ROOMS: Record<string, MockRoomConfig> = {
  '1': { id: '1', smallBlind: 1, bigBlind: 2, botCount: 3 },
  '2': { id: '2', smallBlind: 2, bigBlind: 5, botCount: 3 },
  '3': { id: '3', smallBlind: 5, bigBlind: 10, botCount: 3 },
  '4': { id: '4', smallBlind: 10, bigBlind: 20, botCount: 3 },
  '5': { id: '5', smallBlind: 25, bigBlind: 50, botCount: 2 },
  '6': { id: '6', smallBlind: 50, bigBlind: 100, botCount: 2 },
  '7': { id: '7', smallBlind: 100, bigBlind: 200, botCount: 2 },
  '8': { id: '8', smallBlind: 10, bigBlind: 20, botCount: 1 },
  '9': { id: '9', smallBlind: 500, bigBlind: 1000, botCount: 1 },
  // Dev: full 9-handed table where every bot moves all-in.
  allin: {
    id: 'allin',
    smallBlind: 1,
    bigBlind: 2,
    botCount: 8,
    scenario: 'all-in',
  },
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
