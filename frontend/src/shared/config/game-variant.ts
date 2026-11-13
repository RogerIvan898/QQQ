/** Poker variant a table plays. `nlh` when the server doesn't say. */
export type GameVariant = 'nlh' | 'plo';

export const DEFAULT_GAME_VARIANT: GameVariant = 'nlh';

/** Hole cards dealt to each player per variant. */
export const HOLE_CARDS: Record<GameVariant, number> = {
  nlh: 2,
  plo: 4,
};
