import { createEvent } from 'effector';

import { Sound } from 'shared/assets/sounds';
import { playBuffered } from 'shared/lib/audio';
import { delay } from 'shared/utils/delay';

import { playAllInRunout } from './all-in-runout';
import { SERVER_EVENTS } from './constants';
import { getTotalPot } from './pot';
import { transitionToNextStreet } from './street-transition';
import type {
  BoardDealtEvent,
  GameState,
  HandCompleteEvent,
  ServerGameEvent,
  ShowdownEvent,
  StreetConcludedEvent,
} from './types';

export const collectingBets = createEvent<boolean>();
export const clearActiveSeat = createEvent();

let emit: (event: ServerGameEvent) => void = () => undefined;
let readState: () => Pick<GameState, 'players'> = () => ({ players: {} });

const queue: ServerGameEvent[] = [];
let generation = 0;
let running = false;
let live = false;

export const bindGameQueue = (api: {
  emit: (event: ServerGameEvent) => void;
  readState: () => Pick<GameState, 'players'>;
}) => {
  emit = api.emit;
  readState = api.readState;
};

export const resetEventQueue = () => {
  generation += 1;
  queue.length = 0;
  running = false;
  live = false;
  collectingBets(false);
};

export const markGameQueueLive = () => {
  live = true;
};

export const enqueueServerEvent = (event: ServerGameEvent) => {
  if (!live) {
    emit(event);
    return;
  }

  queue.push(event);
  lastEnqueuedAt = performance.now();
  void run(generation);
};

let lastEnqueuedAt = 0;

/** Quiet time that marks the end of a burst from the server. */
const BURST_GAP_MS = 120;
/** Never hold the queue longer than this waiting for a burst to finish. */
const BURST_MAX_WAIT_MS = 500;

/**
 * The server sends a whole all-in runout at once (street, showdown, board,
 * result), but each message lands as its own task. On a slow device the
 * first one is seen before the rest arrive, and the runout would be played
 * as plain streets. Wait until the burst goes quiet before deciding.
 */
const waitForBurst = async () => {
  const started = performance.now();

  while (
    performance.now() - lastEnqueuedAt < BURST_GAP_MS &&
    performance.now() - started < BURST_MAX_WAIT_MS
  ) {
    await delay(40);
  }
};

const SHOWDOWN_PAUSE_MS = 500;
const WIN_ANIMATION_MS = 1000;

// Animations are paced with timers, which a hidden WebView throttles to one
// per second (one per minute after a while). Without this the queue would keep
// growing in the background and replay minutes of old hands on return.
//
// Lagging by one hand is normal: the server starts the next hand while we
// still animate the runout, and a 9-handed orbit alone is ~20 events. So only
// skip ahead when a second hand is already waiting (or the backlog is huge),
// otherwise the runout would be cut off and its board never shown.
const BACKLOG_HARD_LIMIT = 80;

const queuedHandStarts = () =>
  queue.reduce(
    (count, event) =>
      event.type === SERVER_EVENTS.HAND_STARTED ? count + 1 : count,
    0
  );

/** Dev-only counters for the equity benchmark (`scripts/bench-equity.ts`). */
const debug = import.meta.env.DEV
  ? ((
      window as unknown as { __queueDebug?: Record<string, number> }
    ).__queueDebug ??= {})
  : null;
const count = (key: string) => {
  if (debug) {
    debug[key] = (debug[key] ?? 0) + 1;
  }
};

const shouldFastForward = () => {
  if (typeof document !== 'undefined' && document.hidden) {
    count('ffHidden');
    return true;
  }

  if (queuedHandStarts() >= 2) {
    count('ffTwoHandsBehind');
    return true;
  }

  if (queue.length > BACKLOG_HARD_LIMIT) {
    count('ffHardLimit');
    return true;
  }

  return false;
};

/** Applies everything queued at once, without pauses, animations or sounds. */
const flushQueue = () => {
  collectingBets(false);

  while (queue.length) {
    const event = queue.shift();

    if (event) {
      emit(event);
    }
  }
};

const isStreetEvent = (event: ServerGameEvent | undefined) =>
  event?.type === SERVER_EVENTS.STREET_CONCLUDED ||
  event?.type === SERVER_EVENTS.BOARD_DEALT;

const run = async (gen: number) => {
  if (running || gen !== generation) {
    return;
  }

  running = true;

  while (queue.length && gen === generation) {
    if (shouldFastForward()) {
      flushQueue();
      break;
    }

    if (isStreetEvent(queue[0])) {
      await waitForBurst();

      if (gen !== generation) {
        break;
      }

      if (isAllInRunout(queue)) {
        await playRunout(gen);
      } else {
        await playStreet(gen);
      }

      continue;
    }

    if (queue[0]?.type === SERVER_EVENTS.SHOWDOWN) {
      const showdown = queue.shift();

      if (showdown) {
        emit(showdown);
        playBuffered(Sound.CARD_REVEAL);
      }

      if (!shouldFastForward()) {
        await delay(SHOWDOWN_PAUSE_MS);
      }

      continue;
    }

    if (queue[0]?.type === SERVER_EVENTS.HAND_COMPLETED) {
      const completed = queue.shift();

      if (completed) {
        emit(completed);
      }

      if (!shouldFastForward()) {
        await delay(WIN_ANIMATION_MS);
      }

      continue;
    }

    const event = queue.shift();

    if (event) {
      emit(event);
    }
  }

  running = false;

  if (queue.length && gen === generation) {
    void run(gen);
  }
};

const isAllInRunout = (events: ServerGameEvent[]) =>
  events.some(event => event.type === SERVER_EVENTS.SHOWDOWN) &&
  events.some(event => event.type === SERVER_EVENTS.BOARD_DEALT);

const isRunoutEvent = (event: ServerGameEvent | undefined) =>
  event?.type === SERVER_EVENTS.STREET_CONCLUDED ||
  event?.type === SERVER_EVENTS.BOARD_DEALT ||
  event?.type === SERVER_EVENTS.SHOWDOWN ||
  event?.type === SERVER_EVENTS.HAND_COMPLETED;

const hasCommittedBets = () =>
  Object.values(readState().players).some(player => player.committed > 0);

const toBoardDealt = (
  street: BoardDealtEvent['payload']['street'],
  cards: string[]
): BoardDealtEvent => ({
  type: SERVER_EVENTS.BOARD_DEALT,
  payload: { street, cards: street === 'FLOP' ? cards : cards.slice(-1) },
});

const playRunout = async (gen: number) => {
  let street: StreetConcludedEvent | undefined;
  let showdown: ShowdownEvent | undefined;
  const boards: BoardDealtEvent[] = [];
  let completed: HandCompleteEvent | undefined;

  while (isRunoutEvent(queue[0]) && gen === generation) {
    const event = queue.shift();

    if (event?.type === SERVER_EVENTS.STREET_CONCLUDED) {
      street = event;
    } else if (event?.type === SERVER_EVENTS.SHOWDOWN) {
      showdown = event;
    } else if (event?.type === SERVER_EVENTS.BOARD_DEALT) {
      boards.push(event);
    } else if (event?.type === SERVER_EVENTS.HAND_COMPLETED) {
      completed = event;
    }
  }

  const hadBets = hasCommittedBets();
  const potSize = street ? getTotalPot(street.payload) : 0;

  clearActiveSeat();

  let streetApplied = false;
  let handsRevealed = false;
  let winnerDeclared = false;
  const applyStreet = () => {
    if (streetApplied || !street) {
      return;
    }

    streetApplied = true;
    collectingBets(false);
    emit(street);
  };

  const finished = await playAllInRunout(
    {
      hadBets,
      potSize,
      showdown: Boolean(showdown),
      streets: boards.map(board => board.payload),
    },
    {
      cancelled: () => gen !== generation || shouldFastForward(),
      collectToPot: () => {
        collectingBets(true);
        playBuffered(Sound.CHIPS, 0.12);
      },
      applyStreet,
      revealHands: () => {
        if (!showdown) {
          return;
        }

        handsRevealed = true;
        emit(showdown);
        playBuffered(Sound.CARD_REVEAL);
      },
      dealStreet: (streetName, cards) => {
        emit(toBoardDealt(streetName, cards));
      },
      declareWinner: () => {
        if (completed) {
          winnerDeclared = true;
          emit(completed);
        }
      },
    }
  );

  if (gen !== generation) {
    return;
  }

  collectingBets(false);
  applyStreet();
  count(finished ? 'runoutPlayed' : 'runoutCut');

  if (finished) {
    return;
  }

  // Fast-forwarded: apply whatever the script did not get to. Board events
  // are idempotent, showdown and the result must not be emitted twice.
  if (showdown && !handsRevealed) {
    emit(showdown);
  }

  boards.forEach(board => emit(board));

  if (completed && !winnerDeclared) {
    emit(completed);
  }
};

const playStreet = async (gen: number) => {
  const street =
    queue[0]?.type === SERVER_EVENTS.STREET_CONCLUDED
      ? queue.shift()
      : undefined;
  const board =
    queue[0]?.type === SERVER_EVENTS.BOARD_DEALT ? queue.shift() : undefined;

  if (
    street?.type !== SERVER_EVENTS.STREET_CONCLUDED &&
    board?.type !== SERVER_EVENTS.BOARD_DEALT
  ) {
    return;
  }

  const hadBets = hasCommittedBets();
  const potSize =
    street?.type === SERVER_EVENTS.STREET_CONCLUDED
      ? getTotalPot(street.payload)
      : 0;
  const nextCards =
    board?.type === SERVER_EVENTS.BOARD_DEALT ? board.payload.cards : [];
  const streetName =
    board?.type === SERVER_EVENTS.BOARD_DEALT ? board.payload.street : 'FLOP';

  clearActiveSeat();

  let streetApplied = false;
  const applyStreet = () => {
    if (streetApplied || street?.type !== SERVER_EVENTS.STREET_CONCLUDED) {
      return;
    }

    streetApplied = true;
    collectingBets(false);
    emit(street);
  };

  const finished = await transitionToNextStreet(
    { hadBets },
    nextCards,
    potSize,
    {
      cancelled: () => gen !== generation || shouldFastForward(),
      collectToPot: () => {
        collectingBets(true);
        playBuffered(Sound.CHIPS, 0.12);
      },
      applyStreet,
      revealCards: cards => {
        if (board?.type !== SERVER_EVENTS.BOARD_DEALT) {
          return;
        }

        emit(toBoardDealt(streetName, cards));
      },
    }
  );

  if (gen !== generation) {
    return;
  }

  collectingBets(false);

  if (!finished) {
    applyStreet();

    if (board?.type === SERVER_EVENTS.BOARD_DEALT) {
      emit(board);
    }
  }
};
