import { createEffect, createEvent, createStore, sample } from 'effector';

import { parseCard, type CardType as Card } from 'entities/card';
import {
  gameModel,
  SERVER_EVENTS,
  type GameState,
  type ServerGameEvent,
} from 'entities/game';
import type { PlayerType as Player } from 'entities/player';
import { sessionModel } from 'entities/session';
import type { GameVariant } from 'shared/config/game-variant';
import { readJson, removeStorageByPrefix, writeJson } from 'shared/lib/storage';
import { runInBackground } from 'shared/utils/schedule';

import type { HandAction, HandRecord, HandSeat } from './types';

// История живёт, пока игрок за столом: переживает перезагрузку и закрытие
// окна (можно вернуться за тот же стол), стирается при выходе из-за стола.
// Хранится только один стол: вход за другой стол заменяет запись.
const STORAGE_KEY = 'poker:table-hands';
const MAX_HANDS_PER_ROOM = 50;

interface Saved {
  roomId: string;
  hands: HandRecord[];
}

// Старый формат: по ключу на стол в localStorage, без очистки.
removeStorageByPrefix('poker:hand-history');

const loadHands = (
  roomId: string | null,
  userId: string | null
): HandRecord[] => {
  if (!userId || !roomId) {
    return [];
  }

  const saved = readJson<Partial<Saved> | null>(
    `${STORAGE_KEY}:${userId}`,
    null
  );

  return saved?.roomId === roomId && Array.isArray(saved.hands)
    ? saved.hands
    : [];
};

export const tableEntered = createEvent<string | null>();
export const tableLeft = createEvent();
const handRecorded = createEvent<HandRecord>();
const enteredTable = sample({
  clock: tableEntered,
  source: sessionModel.$currentUserId,
  fn: (userId, roomId) => ({ userId, roomId }),
});

const loadHandsFx = createEffect(
  ({ roomId, userId }: { roomId: string | null; userId: string | null }) =>
    loadHands(roomId, userId)
);

const $roomId = createStore<string | null>(null)
  .on(tableEntered, (_, roomId) => roomId)
  .reset(tableLeft, sessionModel.$currentUserId.updates);

sample({ clock: enteredTable, target: loadHandsFx });

const handsLoaded = sample({
  clock: loadHandsFx.done,
  source: { roomId: $roomId, userId: sessionModel.$currentUserId },
  filter: (current, { params }) =>
    current.roomId === params.roomId && current.userId === params.userId,
  fn: (_, { result }) => result,
});

export const $hands = createStore<HandRecord[]>([])
  .on(handsLoaded, (_, hands) => hands)
  .on(handRecorded, (hands, hand) =>
    [hand, ...hands.filter(saved => saved.id !== hand.id)].slice(
      0,
      MAX_HANDS_PER_ROOM
    )
  )
  .reset(tableLeft, sessionModel.$currentUserId.updates);

// Serializing up to 50 hands runs at background priority: HAND_COMPLETED
// lands right as the pot flies to the winner, and a sync write there can drop
// frames.
let pendingSave: { key: string; value: Saved; cancel: () => void } | null =
  null;
let tableKey: string | null = null;

const flushSave = () => {
  const pending = pendingSave;

  if (!pending) {
    return;
  }

  pending.cancel();
  pendingSave = null;
  writeJson(pending.key, pending.value);
};

const scheduleSave = (roomId: string, hands: HandRecord[]) => {
  if (!tableKey) return;

  pendingSave?.cancel();
  pendingSave = {
    key: tableKey,
    value: { roomId, hands },
    cancel: runInBackground(flushSave),
  };
};

// Reload or close before the background task runs: write right away.
window.addEventListener('pagehide', flushSave);

enteredTable.watch(({ userId }) => {
  tableKey = userId ? `${STORAGE_KEY}:${userId}` : null;
});

tableLeft.watch(() => {
  pendingSave?.cancel();
  pendingSave = null;
  if (tableKey) writeJson(tableKey, null);
  tableKey = null;
});

sample({
  clock: handRecorded,
  source: $hands,
  fn: (hands, hand) => ({ hands, hand }),
}).watch(({ hands, hand }) => {
  if (hand.roomId) {
    scheduleSave(hand.roomId, hands);
  }
});

interface Draft {
  record: Omit<HandRecord, 'finishedAt' | 'net' | 'pot' | 'winners'>;
  mySeat: number | null;
  startStack: number | null;
  revealed: Record<number, Card[]>;
}

let draft: Draft | null = null;

sessionModel.$currentUserId.updates.watch(() => {
  flushSave();
  tableKey = null;
  draft = null;
});

const nameOf = (players: Record<string, Player>, seat: number) =>
  players[seat]?.name ?? `#${seat + 1}`;

const startHand = (
  state: GameState,
  context: { userId: string | null; roomId: string | null; game: GameVariant },
  payload: Extract<
    ServerGameEvent,
    { type: typeof SERVER_EVENTS.HAND_STARTED }
  >['payload']
) => {
  const me = Object.values(state.players).find(
    player => player.id === context.userId
  );
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
      roomId: context.roomId,
      startedAt: new Date().toISOString(),
      game: context.game,
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
  state: GameState,
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

sample({
  clock: gameModel.gameEventApplied,
  source: {
    userId: sessionModel.$currentUserId,
    roomId: $roomId,
    game: gameModel.$gameVariant,
  },
  fn: (context, applied) => ({ context, ...applied }),
}).watch(({ context, state, event }) => {
  if (!tableKey) return;

  switch (event.type) {
    case SERVER_EVENTS.HAND_STARTED:
      startHand(state, context, event.payload);
      break;
    case SERVER_EVENTS.YOUR_CARDS:
      if (draft) {
        draft.record.myCards = event.payload.cards.map(parseCard);
      }
      break;
    case SERVER_EVENTS.PLAYER_ACTED:
      if (draft) {
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
      finishHand(state, event.payload);
      break;
  }
});

gameModel.disconnectGame.watch(() => {
  draft = null;
});
