import { createEvent } from 'effector';

import { Sound } from 'shared/assets/sounds';
import {
  handEndMs,
  HAND_INTRO_MS,
  WINNER_PAUSE_MS,
} from 'shared/config/table-timing';
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
let readHandStartedAt: () => number = () => performance.now();

const queue: ServerGameEvent[] = [];
let generation = 0;
let running = false;
let live = false;

let wakeWaiter: (() => void) | null = null;

const wake = () => {
  const resolve = wakeWaiter;

  wakeWaiter = null;
  resolve?.();
};

const waitForWakeOr = (ms: number) =>
  new Promise<void>(resolve => {
    const timer = window.setTimeout(done, Math.max(0, ms));

    function done() {
      window.clearTimeout(timer);

      if (wakeWaiter === done) {
        wakeWaiter = null;
      }

      resolve();
    }

    wake();
    wakeWaiter = done;
  });

export const bindGameQueue = (api: {
  emit: (event: ServerGameEvent) => void;
  readState: () => Pick<GameState, 'players'>;
  readHandStartedAt: () => number;
}) => {
  emit = api.emit;
  readState = api.readState;
  readHandStartedAt = api.readHandStartedAt;
};

export const resetEventQueue = () => {
  generation += 1;
  queue.length = 0;
  running = false;
  live = false;
  collectingBets(false);
  wake();
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
  wake();
  void run(generation);
};

let lastEnqueuedAt = 0;

const BURST_GAP_MS = 120;

const BURST_MAX_WAIT_MS = 500;

const waitForBurst = async () => {
  const started = performance.now();

  for (;;) {
    const now = performance.now();
    const gapLeft = BURST_GAP_MS - (now - lastEnqueuedAt);
    const maxLeft = BURST_MAX_WAIT_MS - (now - started);

    if (gapLeft <= 0 || maxLeft <= 0) {
      return;
    }

    await waitForWakeOr(Math.min(gapLeft, maxLeft));
  }
};

const SHOWDOWN_PAUSE_MS = 600;

let showdownSeen = false;

const BACKLOG_HARD_LIMIT = 80;

const hasTwoHandStartsQueued = () => {
  let found = 0;

  for (const event of queue) {
    if (event.type === SERVER_EVENTS.HAND_STARTED && ++found >= 2) {
      return true;
    }
  }

  return false;
};

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

  if (hasTwoHandStartsQueued()) {
    count('ffTwoHandsBehind');
    return true;
  }

  if (queue.length > BACKLOG_HARD_LIMIT) {
    count('ffHardLimit');
    return true;
  }

  return false;
};

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
        showdownSeen = true;
        emit(showdown);
        playBuffered(Sound.CARD_REVEAL);
      }

      if (!shouldFastForward()) {
        await delay(SHOWDOWN_PAUSE_MS);
      }

      continue;
    }

    if (queue[0]?.type === SERVER_EVENTS.HAND_STARTED) {
      const started = queue.shift();

      showdownSeen = false;

      if (started) {
        emit(started);
      }

      const introEnds = readHandStartedAt() + HAND_INTRO_MS;

      while (
        performance.now() < introEnds &&
        gen === generation &&
        !shouldFastForward()
      ) {
        const nextHandAt = queue.findIndex(
          event => event.type === SERVER_EVENTS.HAND_STARTED
        );
        const cardsAt = queue.findIndex(
          event => event.type === SERVER_EVENTS.YOUR_CARDS
        );

        if (cardsAt !== -1 && (nextHandAt === -1 || cardsAt < nextHandAt)) {
          const [cards] = queue.splice(cardsAt, 1);

          if (cards) {
            emit(cards);
          }
        }

        await waitForWakeOr(introEnds - performance.now());
      }

      continue;
    }

    if (queue[0]?.type === SERVER_EVENTS.HAND_COMPLETED) {
      if (!shouldFastForward()) {
        await delay(WINNER_PAUSE_MS);
      }

      const completed = queue.shift();

      if (completed) {
        emit(completed);
      }

      if (!shouldFastForward()) {
        await delay(handEndMs(showdownSeen));
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

const isRunoutEvent = (event: ServerGameEvent | undefined) =>
  event?.type === SERVER_EVENTS.STREET_CONCLUDED ||
  event?.type === SERVER_EVENTS.BOARD_DEALT ||
  event?.type === SERVER_EVENTS.SHOWDOWN ||
  event?.type === SERVER_EVENTS.HAND_COMPLETED;

const isAllInRunout = (events: ServerGameEvent[]) => {
  let showdown = false;
  let board = false;

  for (const event of events) {
    if (!isRunoutEvent(event)) {
      break;
    }

    showdown ||= event.type === SERVER_EVENTS.SHOWDOWN;
    board ||= event.type === SERVER_EVENTS.BOARD_DEALT;
  }

  return showdown && board;
};

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
