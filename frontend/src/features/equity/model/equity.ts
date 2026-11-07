import { createEvent, createStore } from 'effector';

import type { CardType as Card } from 'entities/card';
import { gameModel, SERVER_EVENTS } from 'entities/game';
import { PlayerStatus } from 'entities/player';

import { computeEquity } from '../lib/equity';
import type { EquityRequest, EquityResponse } from '../lib/equity.worker';

const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];
const SUITS: Card['suit'][] = ['clubs', 'diamonds', 'hearts', 'spades'];

const toInt = (card: Card) =>
  RANKS.indexOf(card.rank) * 4 + SUITS.indexOf(card.suit);

export interface EquityState {
  /** Seat → share of the pot, 0..1. */
  bySeat: Record<number, number>;
  /** Sampled estimates (3–5-way preflop) are shown
   *  as whole percent: their ±0.5% noise makes a decimal meaningless. */
  exact: boolean;
}

const equityChanged = createEvent<EquityState | null>();

/** Equity while an all-in runout is being dealt; `null` the rest of the time. */
export const $equity = createStore<EquityState | null>(null).on(
  equityChanged,
  (_, equity) => equity
);

let worker: Worker | null = null;
let requestId = 0;
/** Seats of the latest request, in the order the worker answers. */
let pendingSeats: number[] = [];
let active = false;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Keep the final 100% / 0% up until the winner animation has played. */
const HIDE_AFTER_WIN_MS = 1800;
/** Board card deal animation (card.module.css `.play`): new numbers appear
 *  only once the card has landed face-up. */
const CARD_DEAL_MS = 750;

/** Earliest time the next result may be shown. */
let revealAt = 0;
let revealTimer: ReturnType<typeof setTimeout> | null = null;

const clearRevealTimer = () => {
  if (revealTimer !== null) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
};

/** Shows `equity` no earlier than `revealAt`. */
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
      // Stale answer: the board moved on or the hand ended meanwhile.
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
    // No worker support: compute inline (rare, older WebViews).
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

// The runout is the only time hands are revealed before the river: betting is
// over, at least one player is all-in and nobody can act any more. Equity is
// recomputed per street; on the river it is exact (the result), and it stays
// until the winner animation is over.
gameModel.incomingEvent.watch(event => {
  switch (event.type) {
    case SERVER_EVENTS.SHOWDOWN:
      if (gameModel.$gameState.getState().community.length < 5) {
        revealAt = 0;
        recalculate();
      }
      break;
    case SERVER_EVENTS.BOARD_DEALT: {
      // The flop is dealt card by card for the animation; 1–2 cards on the
      // board is not a real spot, so wait for the whole flop.
      const boardSize = gameModel.$gameState.getState().community.length;

      if (active && boardSize !== 1 && boardSize !== 2) {
        revealAt = performance.now() + CARD_DEAL_MS;
        recalculate();
      }
      break;
    }
    case SERVER_EVENTS.HAND_COMPLETED:
      // The river already settled it to 100% / 0% (or a split); hold that
      // while the pot flies to the winner, then clear.
      if (active) {
        clearHideTimer();
        hideTimer = setTimeout(stop, HIDE_AFTER_WIN_MS);
      }
      break;
    case SERVER_EVENTS.HAND_STARTED:
      if (active || $equity.getState()) {
        stop();
      }
      // Start the worker ahead of the first all-in: loading its module takes
      // ~0.4 s on desktop and over a second on a slow phone.
      getWorker();
      break;
  }
});

gameModel.disconnectGame.watch(stop);
