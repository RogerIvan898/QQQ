import { createEvent, createStore } from 'effector';

import { gameModel, SERVER_EVENTS } from 'entities/game';
import type { PlayerType as Player } from 'entities/player';
import { $rooms, findRoom, roomBigBlind, roomFormat } from 'entities/room';
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

const sessionRecorded = createEvent<GameSession>();

export const $sessions = createStore<GameSession[]>(
  readJson<GameSession[]>(SESSIONS_KEY, [])
).on(sessionRecorded, (_, session) =>
  [
    session,
    ...readJson<GameSession[]>(SESSIONS_KEY, []).filter(
      saved => saved.id !== session.id
    ),
  ].slice(0, MAX_SESSIONS)
);

$sessions.updates.watch(sessions => writeJson(SESSIONS_KEY, sessions));

const round = (value: number) => Math.round(value * 100) / 100;

const finish = (draft: Draft) => {
  if (draft.hands === 0 || draft.buyInChips === null) {
    return true;
  }

  const room = findRoom($rooms.getState(), draft.roomId);
  const bigBlindTon = draft.roomBigBlindTon || (room ? roomBigBlind(room) : 0);
  const tonPerChip =
    bigBlindTon && draft.bigBlindChips ? bigBlindTon / draft.bigBlindChips : 0;
  if (!tonPerChip) return false;
  const buyIn = round(draft.buyInChips * tonPerChip);
  const cashOut = round((draft.stackChips ?? 0) * tonPerChip);

  sessionRecorded({
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

const save = () => writeJson(DRAFT_KEY, draft);

const stale = readJson<Draft | null>(DRAFT_KEY, null);
let recovery = readJson<Draft[]>(RECOVERY_KEY, []);

const recover = () => {
  recovery = recovery.filter(saved => !finish(saved));
  writeJson(RECOVERY_KEY, recovery);
};

const finishOrDefer = (saved: Draft) => {
  if (!finish(saved)) {
    recovery.push(saved);
    writeJson(RECOVERY_KEY, recovery);
  }
};

if (stale) {
  finishOrDefer(stale);
  writeJson(DRAFT_KEY, null);
}

$rooms.watch(recover);

export const sessionStarted = createEvent<string>();

export const sessionEnded = createEvent();

sessionStarted.watch(roomId => {
  if (draft) {
    finishOrDefer(draft);
  }

  const now = new Date().toISOString();
  const room = findRoom($rooms.getState(), roomId);

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

sessionEnded.watch(() => {
  if (draft) {
    finishOrDefer(draft);
    draft = null;
    save();
  }
});

const findMe = (players: Record<string, Player>) => {
  const userId = sessionModel.$currentUserId.getState();

  return Object.values(players).find(player => player.id === userId) ?? null;
};

gameModel.incomingEvent.watch(event => {
  if (!draft) {
    return;
  }

  const state = gameModel.$gameState.getState();
  const room = findRoom($rooms.getState(), draft.roomId);
  if (room) {
    draft.roomBigBlindTon = roomBigBlind(room);
    draft.format = roomFormat(room.max);
    draft.blinds = room.blinds;
  }
  const me = findMe(state.players);

  if (!me) {
    return;
  }

  if (draft.buyInChips === null) {
    const blind =
      event.type === SERVER_EVENTS.HAND_STARTED
        ? (event.payload.initialBets[me.seat] ?? 0)
        : 0;

    draft.buyInChips = me.stack + blind;
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
