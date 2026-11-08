export interface GameSession {
  id: string;
  roomId: string;
  gameType: 'cash';

  format: string | null;

  blinds: string | null;
  startedAt: string;
  endedAt: string;
  hands: number;

  buyIn: number;

  cashOut: number;

  net: number;
}

export type SessionPeriod = 'today' | '7d' | '30d' | 'all' | 'custom';
