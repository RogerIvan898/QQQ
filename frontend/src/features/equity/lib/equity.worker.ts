import { computeEquity } from './equity';

export interface EquityRequest {
  id: number;
  hands: number[][];
  board: number[];
}

export interface EquityResponse {
  id: number;
  equities: number[];
}

// Runs off the main thread: a preflop spot samples 40k boards.
self.onmessage = (event: MessageEvent<EquityRequest>) => {
  const { id, hands, board } = event.data;
  const response: EquityResponse = {
    id,
    equities: computeEquity(hands, board),
  };

  self.postMessage(response);
};
