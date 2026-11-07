import {
  choose,
  computeEquity,
  EXACT_EVAL_LIMIT,
  INSTANT_EVAL_LIMIT,
} from './equity';

export interface EquityRequest {
  id: number;
  hands: number[][];
  board: number[];
}

export interface EquityResponse {
  id: number;
  equities: number[];
  /** Sampled estimates come first for slow spots, then the exact answer. */
  exact: boolean;
}

// Runs off the main thread. Heads-up preflop is enumerated exactly (~3.4M
// evaluations, up to a few seconds on a slow phone), so a quick sampled
// estimate is sent first and replaced when the exact numbers are ready.
self.onmessage = (event: MessageEvent<EquityRequest>) => {
  const { id, hands, board } = event.data;
  const deckLeft = 52 - board.length - hands.length * 2;
  const evaluations = choose(deckLeft, 5 - board.length) * hands.length;
  const slowExact =
    evaluations > INSTANT_EVAL_LIMIT && evaluations <= EXACT_EVAL_LIMIT;

  if (slowExact) {
    self.postMessage({
      id,
      ...computeEquity(hands, board, 'sample'),
    } satisfies EquityResponse);
  }

  // Exact when affordable, otherwise the (single) sampled estimate.
  self.postMessage({
    id,
    ...computeEquity(hands, board),
  } satisfies EquityResponse);
};
