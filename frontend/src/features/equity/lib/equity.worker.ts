import type { GameVariant } from 'shared/config/game-variant';

import { computeEquity } from './equity';
import { computeOmahaEquity } from './omaha-equity';

export interface EquityRequest {
  id: number;
  hands: number[][];
  board: number[];
  variant: GameVariant;
}

export interface EquityResponse {
  id: number;
  equities: number[];
  exact: boolean;

  timing: { received: number; start: number; end: number };
}

const now = () => performance.timeOrigin + performance.now();

self.onmessage = (event: MessageEvent<EquityRequest>) => {
  const received = now();
  const { id, hands, board, variant } = event.data;
  const start = now();
  const result =
    variant === 'plo'
      ? computeOmahaEquity(hands, board)
      : computeEquity(hands, board);

  self.postMessage({
    id,
    ...result,
    timing: { received, start, end: now() },
  } satisfies EquityResponse);
};
