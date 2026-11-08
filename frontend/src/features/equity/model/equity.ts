import { createEvent, createStore } from 'effector';

import { gameModel, SERVER_EVENTS } from 'entities/game';
import { PlayerStatus } from 'entities/player';
import { HAND_END_MS } from 'shared/config/table-timing';

import { cardToInt as toInt } from '../lib/card-int';
import { computeEquity } from '../lib/equity';
import type { EquityRequest, EquityResponse } from '../lib/equity.worker';

export interface EquityState {
  bySeat: Record<number, number>;

  exact: boolean;
}

const equityChanged = createEvent<EquityState | null>();

export const $equity = createStore<EquityState | null>(null).on(
  equityChanged,
  (_, equity) => equity
);

let worker: Worker | null = null;
let requestId = 0;

let pendingSeats: number[] = [];
let active = false;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const HIDE_AFTER_WIN_MS = HAND_END_MS + 300;

const CARD_DEAL_MS = 750;

let revealAt = 0;
let revealTimer: ReturnType<typeof setTimeout> | null = null;

const clearRevealTimer = () => {
  if (revealTimer !== null) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
};

const publish = (equity: EquityState, id: number) => {
  clearRevealTimer();
  const wait = revealAt - performance.now();

  if (wait <= 0) {
    equityChanged(equity);
    return;
  }

  revealTimer = setTimeout(() => {
    revealTimer = null;

    if (id === requestId && active) {
      equityChanged(equity);
    }
  }, wait);
};

const clearHideTimer = () => {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
};

const getWorker = () => {
  if (worker || typeof Worker === 'undefined') {
    return worker;
  }

  try {
    worker = new Worker(new URL('../lib/equity.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<EquityResponse>) => {
      if (event.data.id !== requestId || !active) {
        return;
      }

      publish(
        {
          bySeat: Object.fromEntries(
            pendingSeats.map((seat, index) => [
              seat,
              event.data.equities[index],
            ])
          ),
          exact: event.data.exact,
        },
        event.data.id
      );
    };
  } catch {
    worker = null;
  }

  return worker;
};

const stop = () => {
  clearHideTimer();
  clearRevealTimer();
  active = false;
  requestId += 1;
  equityChanged(null);
};

const recalculate = () => {
  const state = gameModel.$gameState.getState();

  const contenders = Object.values(state.players).filter(
    player => player.hand && player.status !== PlayerStatus.FOLDED
  );

  if (contenders.length < 2) {
    stop();
    return;
  }

  clearHideTimer();
  active = true;
  requestId += 1;
  pendingSeats = contenders.map(player => player.seat);

  const request: EquityRequest = {
    id: requestId,
    hands: contenders.map(player => (player.hand ?? []).map(toInt)),
    board: state.community.map(toInt),
  };
  const target = getWorker();

  if (target) {
    target.postMessage(request);
  } else {
    const result = computeEquity(request.hands, request.board);

    publish(
      {
        bySeat: Object.fromEntries(
          pendingSeats.map((seat, index) => [seat, result.equities[index]])
        ),
        exact: result.exact,
      },
      requestId
    );
  }
};

gameModel.incomingEvent.watch(event => {
  switch (event.type) {
    case SERVER_EVENTS.SHOWDOWN:
      if (gameModel.$gameState.getState().community.length < 5) {
        revealAt = 0;
        recalculate();
      }
      break;
    case SERVER_EVENTS.BOARD_DEALT: {
      const boardSize = gameModel.$gameState.getState().community.length;

      if (active && boardSize !== 1 && boardSize !== 2) {
        revealAt = performance.now() + CARD_DEAL_MS;
        recalculate();
      }
      break;
    }
    case SERVER_EVENTS.HAND_COMPLETED:
      if (active) {
        clearHideTimer();
        hideTimer = setTimeout(stop, HIDE_AFTER_WIN_MS);
      }
      break;
    case SERVER_EVENTS.HAND_STARTED:
      if (active || $equity.getState()) {
        stop();
      }

      getWorker();
      break;
  }
});

gameModel.disconnectGame.watch(stop);

getWorker();
