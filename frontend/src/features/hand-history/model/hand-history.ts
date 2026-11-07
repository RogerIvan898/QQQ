import { createEvent, createStore } from 'effector';

import { parseCard, type CardType as Card } from 'entities/card';
import { gameModel, SERVER_EVENTS, type ServerGameEvent } from 'entities/game';
import type { PlayerType as Player } from 'entities/player';
import { sessionModel } from 'entities/session';

import type { HandAction, HandRecord, HandSeat } from './types';

const STORAGE_KEY = 'poker:hand-history';
const MAX_HANDS = 100;

const loadHands = (): HandRecord[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? (parsed as HandRecord[]) : [];
  } catch {
    return [];
  }
};

const saveHands = (hands: HandRecord[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hands));
  } catch {
    // Storage can be full or blocked (private mode); history is best-effort.
  }
};

/** The table the player is sitting at, so hands can be labelled with it. */
export const tableEntered = createEvent<string | null>();
const handRecorded = createEvent<HandRecord>();
export const historyCleared = createEvent();

const $roomId = createStore<string | null>(null).on(
  tableEntered,
  (_, roomId) => roomId
);

// TODO: load from the backend once it keeps hand histories.
export const $hands = createStore<HandRecord[]>(loadHands())
  // Re-read storage so another tab (or a stale dev module copy) writing its own
  // list can't drop hands recorded elsewhere.
  .on(handRecorded, (_, hand) =>
    [hand, ...loadHands().filter(saved => saved.id !== hand.id)].slice(
      0,
      MAX_HANDS
    )
  )
  .reset(historyCleared);

$hands.updates.watch(saveHands);

interface Draft {
  record: Omit<HandRecord, 'finishedAt' | 'net' | 'pot' | 'winners'>;
  mySeat: number | null;
  startStack: number | null;
  revealed: Record<number, Card[]>;
}

let draft: Draft | null = null;

const findMe = (players: Record<string, Player>) => {
  const userId = sessionModel.$currentUserId.getState();

  return Object.values(players).find(player => player.id === userId) ?? null;
};

const nameOf = (players: Record<string, Player>, seat: number) =>
  players[seat]?.name ?? `#${seat + 1}`;

const startHand = (
  payload: Extract<
    ServerGameEvent,
    { type: typeof SERVER_EVENTS.HAND_STARTED }
  >['payload']
) => {
  const state = gameModel.$gameState.getState();
  const me = findMe(state.players);
  const mySeat = me?.seat ?? null;
  const blind = (seat: number, action: 'SB' | 'BB'): HandAction => ({
    street: 'PREFLOP',
    seat,
    name: nameOf(state.players, seat),
    action,
    amount: payload.initialBets[seat] ?? null,
    isMe: seat === mySeat,
  });

  draft = {
    mySeat,
    startStack: me?.stack ?? null,
    revealed: {},
    record: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId: $roomId.getState(),
      startedAt: new Date().toISOString(),
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      myCards: null,
      board: [],
      seats: [],
      actions: [
        blind(payload.smallBlindSeat, 'SB'),
        blind(payload.bigBlindSeat, 'BB'),
      ],
    },
  };
};

const finishHand = (
  payload: Extract<
    ServerGameEvent,
    { type: typeof SERVER_EVENTS.HAND_COMPLETED }
  >['payload']
) => {
  if (!draft) {
    return;
  }

  const current = draft;
  draft = null;

  // Not seated this hand: nothing personal to record.
  if (current.mySeat === null) {
    return;
  }

  const state = gameModel.$gameState.getState();
  const endStack = state.players[current.mySeat]?.stack ?? null;
  const seats: HandSeat[] = Object.values(state.players)
    .sort((a, b) => a.seat - b.seat)
    .map(player => ({
      seat: player.seat,
      name: player.name,
      isMe: player.seat === current.mySeat,
      cards:
        player.seat === current.mySeat
          ? current.record.myCards
          : (current.revealed[player.seat] ?? null),
    }));
  const winners = payload.winners.map(winner => ({
    seat: winner.seatIndex,
    name: nameOf(state.players, winner.seatIndex),
    amount: winner.amountWon,
    combination: winner.combinationName,
    isMe: winner.seatIndex === current.mySeat,
  }));

  handRecorded({
    ...current.record,
    finishedAt: new Date().toISOString(),
    board: state.community,
    seats,
    winners,
    pot: winners.reduce((sum, winner) => sum + winner.amount, 0),
    net:
      endStack !== null && current.startStack !== null
        ? endStack - current.startStack
        : 0,
  });
};

// Events arrive here already applied to the game state, in table order.
gameModel.incomingEvent.watch(event => {
  switch (event.type) {
    case SERVER_EVENTS.HAND_STARTED:
      startHand(event.payload);
      break;
    case SERVER_EVENTS.YOUR_CARDS:
      if (draft) {
        draft.record.myCards = event.payload.cards.map(parseCard);
      }
      break;
    case SERVER_EVENTS.PLAYER_ACTED:
      if (draft) {
        const state = gameModel.$gameState.getState();

        draft.record.actions.push({
          street: state.round,
          seat: event.payload.seat,
          name: nameOf(state.players, event.payload.seat),
          action: event.payload.action,
          amount: event.payload.amount ?? null,
          isMe: event.payload.seat === draft.mySeat,
        });
      }
      break;
    case SERVER_EVENTS.SHOWDOWN:
      if (draft) {
        for (const [seat, cards] of Object.entries(
          event.payload.revealedHands
        )) {
          draft.revealed[Number(seat)] = cards.map(parseCard);
        }
      }
      break;
    case SERVER_EVENTS.HAND_COMPLETED:
      finishHand(event.payload);
      break;
  }
});

// A hand cut off by leaving the table is not recorded.
gameModel.disconnectGame.watch(() => {
  draft = null;
});
