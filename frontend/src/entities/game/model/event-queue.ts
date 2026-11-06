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
  void run(generation);
};

const SHOWDOWN_PAUSE_MS = 500;
const WIN_ANIMATION_MS = 1000;

const isStreetEvent = (event: ServerGameEvent | undefined) =>
  event?.type === SERVER_EVENTS.STREET_CONCLUDED ||
  event?.type === SERVER_EVENTS.BOARD_DEALT;

const run = async (gen: number) => {
  if (running || gen !== generation) {
    return;
  }

  running = true;

  while (queue.length && gen === generation) {
    if (isStreetEvent(queue[0])) {
      await delay(0);

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

      await delay(SHOWDOWN_PAUSE_MS);
      continue;
    }

    if (queue[0]?.type === SERVER_EVENTS.HAND_COMPLETED) {
      const completed = queue.shift();

      if (completed) {
        emit(completed);
      }

      await delay(WIN_ANIMATION_MS);
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
  const applyStreet = () => {
    if (streetApplied || !street) {
      return;
    }

    streetApplied = true;
    collectingBets(false);
    emit(street);
  };

  await playAllInRunout(
    {
      hadBets,
      potSize,
      showdown: Boolean(showdown),
      streets: boards.map(board => board.payload),
    },
    {
      cancelled: () => gen !== generation,
      collectToPot: () => {
        collectingBets(true);
        playBuffered(Sound.CHIPS, 0.12);
      },
      applyStreet,
      revealHands: () => {
        if (!showdown) {
          return;
        }

        emit(showdown);
        playBuffered(Sound.CARD_REVEAL);
      },
      dealStreet: (streetName, cards) => {
        emit(toBoardDealt(streetName, cards));
      },
      declareWinner: () => {
        if (completed) {
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
      cancelled: () => gen !== generation,
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
