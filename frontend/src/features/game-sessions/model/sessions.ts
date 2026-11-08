import { createEvent, createStore } from 'effector';

import { gameModel, SERVER_EVENTS } from 'entities/game';
import type { PlayerType as Player } from 'entities/player';
import { $rooms, findRoom, roomBigBlind, roomFormat } from 'entities/room';
import { sessionModel } from 'entities/session';

import type { GameSession } from './types';

const SESSIONS_KEY = 'poker:game-sessions';
const DRAFT_KEY = 'poker:game-session-draft';
const MAX_SESSIONS = 500;

/** A table sitting in progress; persisted so a closed app still counts it. */
interface Draft {
  id: string;
  roomId: string;
  startedAt: string;
  lastSeenAt: string;
  /** All chips brought to the table (initial buy-in; rebuys add to it). */
  buyInChips: number | null;
  stackChips: number | null;
  bigBlindChips: number | null;
  hands: number;
  /** Seated when the current hand started, so it counts towards `hands`. */
  inHand: boolean;
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Storage full or blocked: history is best-effort until the backend has it.
  }
};

const sessionRecorded = createEvent<GameSession>();

// TODO: replace with `GET /history/sessions` once the backend keeps sessions.
/** Finished table sessions, newest first. */
export const $sessions = createStore<GameSession[]>(
  read<GameSession[]>(SESSIONS_KEY, [])
).on(sessionRecorded, (_, session) =>
  // Re-read so another tab writing its own list can't drop sessions.
  [
    session,
    ...read<GameSession[]>(SESSIONS_KEY, []).filter(
      saved => saved.id !== session.id
    ),
  ].slice(0, MAX_SESSIONS)
);

$sessions.updates.watch(sessions => write(SESSIONS_KEY, sessions));

const round = (value: number) => Math.round(value * 100) / 100;

/** Chips → TON via the room's big blind (the table only knows chips). */
const finish = (draft: Draft) => {
  if (draft.hands === 0 || draft.buyInChips === null) {
    return;
  }

  const room = findRoom($rooms.getState(), draft.roomId);
  const bigBlindTon = room ? roomBigBlind(room) : 0;
  const tonPerChip =
    bigBlindTon && draft.bigBlindChips ? bigBlindTon / draft.bigBlindChips : 0;
  const buyIn = round(draft.buyInChips * tonPerChip);
  const cashOut = round((draft.stackChips ?? 0) * tonPerChip);

  sessionRecorded({
    id: draft.id,
    roomId: draft.roomId,
    gameType: 'cash',
    format: room ? roomFormat(room.max) : null,
    blinds: room?.blinds ?? null,
    startedAt: draft.startedAt,
    endedAt: draft.lastSeenAt,
    hands: draft.hands,
    buyIn,
    cashOut,
    net: round(cashOut - buyIn),
  });
};

let draft: Draft | null = null;

const save = () => write(DRAFT_KEY, draft);

// A draft left over from a closed tab or crash ends where it was last seen.
const stale = read<Draft | null>(DRAFT_KEY, null);

if (stale) {
  finish(stale);
  write(DRAFT_KEY, null);
}

/** Sitting down at a table starts a session (one per table sitting). */
export const sessionStarted = createEvent<string>();
/** Leaving the table ends it. */
export const sessionEnded = createEvent();

sessionStarted.watch(roomId => {
  if (draft) {
    finish(draft);
  }

  const now = new Date().toISOString();

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
  };
  save();
});

sessionEnded.watch(() => {
  if (draft) {
    finish(draft);
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
  const me = findMe(state.players);

  if (!me) {
    return;
  }

  // The first stack we see is the buy-in. Rebuys would add to it here once
  // the table supports them.
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
