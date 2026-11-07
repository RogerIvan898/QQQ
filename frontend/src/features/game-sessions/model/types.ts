/** One sitting at one table, from sitting down to leaving. */
export interface GameSession {
  id: string;
  roomId: string;
  gameType: 'cash';
  /** "Heads-Up" / "6-Max" / "9-Max"; null for unknown rooms. */
  format: string | null;
  /** "SB/BB" in TON. */
  blinds: string | null;
  startedAt: string;
  endedAt: string;
  hands: number;
  /** All buy-ins and rebuys, TON. */
  buyIn: number;
  /** Stack when leaving, TON. */
  cashOut: number;
  /** cashOut − buyIn, TON. */
  net: number;
}

export type SessionPeriod = 'today' | '7d' | '30d' | 'all' | 'custom';
