import { combine, createEvent, createStore, sample } from 'effector';

import { gameModel, SERVER_EVENTS } from 'entities/game';
import {
  $rooms,
  findRoom,
  roomBigBlind,
  roomFormat,
  type RoomListItem,
} from 'entities/room';
import { sessionModel } from 'entities/session';
import { readJson, writeJson } from 'shared/lib/storage';

import type { GameSession } from './types';

const SESSIONS_KEY = 'poker:game-sessions';
const DRAFT_KEY = 'poker:game-session-draft';
const RECOVERY_KEY = 'poker:game-session-recovery';
const MAX_SESSIONS = 500;

interface Draft {
  id: string;
  roomId: string;
  startedAt: string;
  lastSeenAt: string;

  buyInChips: number | null;
  stackChips: number | null;
  bigBlindChips: number | null;
  hands: number;

  inHand: boolean;
  roomBigBlindTon?: number;
  format?: string | null;
  blinds?: string | null;
}

const sessionsLoaded = createEvent<GameSession[]>();
export const $sessions = createStore<GameSession[]>([]).on(
  sessionsLoaded,
  (_, sessions) => sessions
);

let owner: string | null = null;

const record = (session: GameSession) => {
  if (!owner) return;

  const key = `${SESSIONS_KEY}:${owner}`;
  const saved = readJson<GameSession[]>(key, []);
  const sessions = [
    session,
    ...saved.filter(item => item.id !== session.id),
  ].slice(0, MAX_SESSIONS);

  writeJson(key, sessions);
  sessionsLoaded(sessions);
};

const round = (value: number) => Math.round(value * 100) / 100;

const finish = (draft: Draft, rooms: readonly RoomListItem[]) => {
  if (draft.hands === 0 || draft.buyInChips === null) {
    return true;
  }

  const room = findRoom(rooms, draft.roomId);

  const bigBlindTon = draft.roomBigBlindTon || (room ? roomBigBlind(room) : 0);
  const tonPerChip =
    bigBlindTon && draft.bigBlindChips ? bigBlindTon / draft.bigBlindChips : 0;
  if (!tonPerChip) {
    return false;
  }

  const buyIn = round(draft.buyInChips * tonPerChip);
  const cashOut = round((draft.stackChips ?? 0) * tonPerChip);

  record({
    id: draft.id,
    roomId: draft.roomId,
    gameType: 'cash',
    format: draft.format ?? (room ? roomFormat(room.max) : null),
    blinds: draft.blinds ?? room?.blinds ?? null,
    startedAt: draft.startedAt,
    endedAt: draft.lastSeenAt,
    hands: draft.hands,
    buyIn,
    cashOut,
    net: round(cashOut - buyIn),
  });

  return true;
};

let draft: Draft | null = null;

const save = () => {
  if (owner) writeJson(`${DRAFT_KEY}:${owner}`, draft);
};

let recovery: Draft[] = [];

const recover = (rooms: readonly RoomListItem[]) => {
  if (!owner || !recovery.length) return;

  recovery = recovery.filter(saved => !finish(saved, rooms));
  writeJson(`${RECOVERY_KEY}:${owner}`, recovery);
};

const finishOrDefer = (saved: Draft, rooms: readonly RoomListItem[]) => {
  if (!finish(saved, rooms)) {
    recovery.push(saved);
    writeJson(`${RECOVERY_KEY}:${owner}`, recovery);
  }
};

combine({ rooms: $rooms, userId: sessionModel.$currentUserId }).watch(
  ({ rooms, userId }) => {
    if (userId === owner) {
      recover(rooms);

      return;
    }

    if (draft) {
      finishOrDefer(draft, rooms);
      draft = null;
      save();
    }

    owner = userId;
    recovery = [];
    sessionsLoaded(
      owner ? readJson<GameSession[]>(`${SESSIONS_KEY}:${owner}`, []) : []
    );

    if (!owner) return;

    recovery = readJson<Draft[]>(`${RECOVERY_KEY}:${owner}`, []);
    const stale = readJson<Draft | null>(`${DRAFT_KEY}:${owner}`, null);

    if (stale) {
      finishOrDefer(stale, rooms);
      save();
    }

    recover(rooms);
  }
);

export const sessionStarted = createEvent<string>();

export const sessionEnded = createEvent();

sample({
  clock: sessionStarted,
  source: $rooms,
  fn: (rooms, roomId) => ({ rooms, roomId }),
}).watch(({ rooms, roomId }) => {
  if (!owner) return;

  if (draft) {
    finishOrDefer(draft, rooms);
  }

  const now = new Date().toISOString();
  const room = findRoom(rooms, roomId);

  draft = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    startedAt: now,
    lastSeenAt: now,
    buyInChips: null,
    stackChips: null,
    bigBlindChips: null,
    hands: 0,
    inHand: false,
    roomBigBlindTon: room ? roomBigBlind(room) : undefined,
    format: room ? roomFormat(room.max) : null,
    blinds: room?.blinds ?? null,
  };
  save();
});

sample({ clock: sessionEnded, source: $rooms }).watch(rooms => {
  if (draft) {
    finishOrDefer(draft, rooms);
    draft = null;
    save();
  }
});

sample({
  clock: gameModel.gameEventApplied,
  source: $rooms,
  fn: (rooms, applied) => ({ rooms, ...applied }),
}).watch(({ rooms, state, event }) => {
  if (!draft) {
    return;
  }

  const room = findRoom(rooms, draft.roomId);

  if (room) {
    draft.roomBigBlindTon = roomBigBlind(room);
    draft.format = roomFormat(room.max);
    draft.blinds = room.blinds;
  }

  const me = Object.values(state.players).find(player => player.id === owner);

  if (!me) {
    return;
  }

  if (draft.buyInChips === null) {
    if (event.type === SERVER_EVENTS.HAND_STARTED) {
      draft.buyInChips = me.stack + (event.payload.initialBets[me.seat] ?? 0);
    } else if (
      event.type === SERVER_EVENTS.PLAYER_ACTED ||
      event.type === SERVER_EVENTS.HAND_COMPLETED
    ) {
      // Joining mid-hand: keep the stack observed before the first action.
      draft.buyInChips = draft.stackChips ?? me.stack;
    }
  }

  draft.stackChips = me.stack;
  draft.bigBlindChips = state.bigBlind || draft.bigBlindChips;
  draft.lastSeenAt = new Date().toISOString();

  if (event.type === SERVER_EVENTS.HAND_STARTED) {
    draft.inHand = true;
  } else if (event.type === SERVER_EVENTS.HAND_COMPLETED && draft.inHand) {
    draft.hands += 1;
    draft.inHand = false;
  }

  save();
});
