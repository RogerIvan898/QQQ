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

  timing: { received: number; start: number; end: number };
}

const now = () => performance.timeOrigin + performance.now();

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
