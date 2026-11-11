import { createEvent, createStore } from 'effector';

import { parseCard, type CardType as Card } from 'entities/card';
import { gameModel, SERVER_EVENTS, type ServerGameEvent } from 'entities/game';
import type { PlayerType as Player } from 'entities/player';
import { sessionModel } from 'entities/session';
import { readJson, writeJson, writeStorage } from 'shared/lib/storage';

import type { HandAction, HandRecord, HandSeat } from './types';

const STORAGE_PREFIX = 'poker:hand-history:';
const MAX_HANDS_PER_ROOM = 50;

const storageKey = (roomId: string) => `${STORAGE_PREFIX}${roomId}`;

writeStorage('poker:hand-history', null);

const loadHands = (roomId: string | null): HandRecord[] => {
  if (!roomId) {
    return [];
  }

  const parsed = readJson<unknown>(storageKey(roomId), []);

  return Array.isArray(parsed) ? (parsed as HandRecord[]) : [];
};

const saveHands = (roomId: string, hands: HandRecord[]) => {
  writeJson(storageKey(roomId), hands);
};

export const tableEntered = createEvent<string | null>();
const handRecorded = createEvent<HandRecord>();

const $roomId = createStore<string | null>(null).on(
  tableEntered,
  (_, roomId) => roomId
);

export const $hands = createStore<HandRecord[]>([])
  .on(tableEntered, (_, roomId) => loadHands(roomId))
  .on(handRecorded, (_, hand) =>
    [
      hand,
      ...loadHands(hand.roomId).filter(saved => saved.id !== hand.id),
    ].slice(0, MAX_HANDS_PER_ROOM)
  );

handRecorded.watch(hand => {
  if (hand.roomId) {
    saveHands(hand.roomId, $hands.getState());
  }
});

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
    startStack: me ? me.stack + (payload.initialBets[me.seat] ?? 0) : null,
    revealed: {},
    record: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId: $roomId.getState(),
      startedAt: new Date().toISOString(),
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      dealerSeat: payload.dealerSeat,
      smallBlindSeat: payload.smallBlindSeat,
      bigBlindSeat: payload.bigBlindSeat,
      myCards: null,
      board: [],
      seats: Object.values(state.players)
        .sort((a, b) => a.seat - b.seat)
        .map(player => ({
          seat: player.seat,
          name: player.name,
          isMe: player.seat === mySeat,
          stack: player.stack + (payload.initialBets[player.seat] ?? 0),
          cards: null,
        })),
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

  if (current.mySeat === null) {
    return;
  }

  const state = gameModel.$gameState.getState();
  const endStack = state.players[current.mySeat]?.stack ?? null;
  const seats: HandSeat[] = current.record.seats.map(seat => ({
    ...seat,
    cards: seat.isMe
      ? current.record.myCards
      : (current.revealed[seat.seat] ?? null),
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

gameModel.disconnectGame.watch(() => {
  draft = null;
});
