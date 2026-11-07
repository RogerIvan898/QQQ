import { computeEquity } from './equity';

export interface EquityRequest {
  id: number;
  hands: number[][];
  board: number[];
}

export interface EquityResponse {
  id: number;
  equities: number[];
  exact: boolean;
  /** Absolute times (timeOrigin-based ms) for profiling: request picked up,
   *  computation start and end. */
  timing: { received: number; start: number; end: number };
}

const now = () => performance.timeOrigin + performance.now();

// Runs off the main thread, one answer per request: exact when affordable,
// otherwise a single sampled estimate. The slowest spot (heads-up preflop,
// ~3.4M evaluations) takes ~140 ms on desktop, well inside the pause before
// the flop, so a quick sampled preview is not worth its extra work and the
// extra main-thread message it costs.
self.onmessage = (event: MessageEvent<EquityRequest>) => {
  const received = now();
  const { id, hands, board } = event.data;
  const start = now();
  const result = computeEquity(hands, board);

  self.postMessage({
    id,
    ...result,
    timing: { received, start, end: now() },
  } satisfies EquityResponse);
};
