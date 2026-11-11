import {
  combine,
  createEffect,
  createEvent,
  createStore,
  sample,
} from 'effector';

import type { CardType as Card } from 'entities/card';
import type { PlayerType as Player } from 'entities/player';
import { DEAL_START_MS, DEALER_START_MS } from 'shared/config/table-timing';
import { displayBigBlindChanged } from 'shared/lib/display-settings';

import { watchPlayerActionSounds } from './action-sounds';
import {
  closeOpenGameSocket,
  connectionLost,
  openGameSocket,
  prepareGameAudio,
  sendToGameSocket,
} from './connection';
import { INITIAL_GAME_STATE, SERVER_EVENTS } from './constants';
import {
  bindGameQueue,
  clearActiveSeat,
  collectingBets,
  resetEventQueue,
} from './event-queue';
import {
  reduceAllowedActions,
  reduceDebugHoles,
  reduceMyCards,
} from './projections';
import { reduceGameEvent } from './reducers';
import type {
  AllowedPlayerActionsEvent,
  ClientGameEvent,
  GameConnectParams,
  ServerGameEvent,
} from './types';

export const incomingEvent = createEvent<ServerGameEvent>();

const TABLE_WAIT_MS = 8000;

const initializeGameFx = createEffect(async (params: GameConnectParams) => {
  const audioReady = prepareGameAudio();
  const socket = openGameSocket(params);

  await audioReady;

  return socket;
});

const waitForTableFx = createEffect(
  (attempt: number) =>
    new Promise<number>(resolve =>
      window.setTimeout(() => resolve(attempt), TABLE_WAIT_MS)
    )
);

const sendClientCommandFx = createEffect((command: unknown) => {
  if (!sendToGameSocket(command)) {
    console.warn('[WS] Cannot send action: socket is not open');
  }
});

export const connectGame = createEvent<GameConnectParams>();
export const sendClientCommand = createEvent<ClientGameEvent>();
export const disconnectGame = createEvent();

const $socketClient = createStore<WebSocket | null>(null)
  .on(initializeGameFx.doneData, (_, socket) => socket)
  .reset(disconnectGame);

const $connectAttempt = createStore(0).on(connectGame, n => n + 1);

const $connecting = createStore(false)
  .on(connectGame, () => true)
  .reset(disconnectGame);

const $tableReady = createStore(false)
  .on(
    incomingEvent,
    (ready, event) =>
      ready ||
      event.type === SERVER_EVENTS.PLAYER_SEATED ||
      event.type === SERVER_EVENTS.HAND_STARTED
  )
  .reset(connectGame, disconnectGame);

sample({ clock: $connectAttempt, target: waitForTableFx });

sample({
  clock: waitForTableFx.doneData,
  source: $connectAttempt,
  filter: (current, attempt) => current === attempt,
  fn: () => true,
  target: $tableReady,
});

export const $isGameLoading = combine(
  initializeGameFx.pending,
  $connecting,
  $tableReady,
  (opening, connecting, ready) => opening || (connecting && !ready)
);

export const $connectionLost = createStore(false)
  .on(connectionLost, (_, lost) => lost)
  .reset(disconnectGame);

export const $gameState = createStore(INITIAL_GAME_STATE)
  .on(incomingEvent, reduceGameEvent)
  .on(clearActiveSeat, state => ({ ...state, activeSeat: null }))
  .reset(disconnectGame);

export const $turnTiming = createStore<{
  turnMs: number;
  timeBankMs: number;
} | null>(null)
  .on(incomingEvent, (timing, event) => {
    if (event.type !== SERVER_EVENTS.TURN_CHANGED) {
      return timing;
    }

    const { turnMs, timeBankMs } = event.payload;

    return turnMs == null ? null : { turnMs, timeBankMs: timeBankMs ?? 0 };
  })
  .reset(disconnectGame);

export const $showdownThisHand = createStore(false)
  .on(incomingEvent, (seen, event) => {
    if (event.type === SERVER_EVENTS.HAND_STARTED) return false;
    if (event.type === SERVER_EVENTS.SHOWDOWN) return true;

    return seen;
  })
  .reset(disconnectGame);

export const $handNumber = createStore(0)
  .on(incomingEvent, (count, event) =>
    event.type === SERVER_EVENTS.HAND_STARTED ? count + 1 : count
  )
  .reset(disconnectGame);

const FIRST_DEAL_DELAY_MS = 250;

export const $handStartedAt = createStore(0)
  .on(incomingEvent, (at, event) => {
    if (event.type !== SERVER_EVENTS.HAND_STARTED) {
      return at;
    }

    const now = performance.now();

    return at === 0 ? now - DEAL_START_MS + FIRST_DEAL_DELAY_MS : now;
  })
  .reset(disconnectGame);

export const $collectingBets = createStore(false)
  .on(collectingBets, (_, collecting) => collecting)
  .reset(disconnectGame);

export const $debugHoles = createStore<Record<number, [Card, Card]>>({})
  .on(incomingEvent, reduceDebugHoles)
  .reset(disconnectGame);

export const $myCards = createStore<Player['hand']>(null)
  .on(incomingEvent, reduceMyCards)
  .reset(disconnectGame);

export const $myAllowedActions = createStore<
  AllowedPlayerActionsEvent['payload'] | null
>(null)
  .on(incomingEvent, reduceAllowedActions)
  .reset(disconnectGame);

const $actualDealerSeat = $gameState.map(state => state.dealerSeat);

const moveDealerFx = createEffect(
  (seat: number | null) =>
    new Promise<number | null>(resolve =>
      window.setTimeout(() => resolve(seat), DEALER_START_MS)
    )
);

const placeDealer = createEvent<number | null>();

export const $dealerSeat = createStore<number | null>(null)
  .on(moveDealerFx.doneData, (_, seat) => seat)
  .on(placeDealer, (_, seat) => seat)
  .reset(disconnectGame);

sample({
  clock: $actualDealerSeat,
  source: $dealerSeat,
  filter: (shown, actual) => shown === null && actual !== null,
  fn: (_, actual) => actual,
  target: placeDealer,
});

sample({
  clock: $actualDealerSeat,
  source: $dealerSeat,
  filter: (shown, actual) => shown !== null && shown !== actual,
  fn: (_, actual) => actual,
  target: moveDealerFx,
});

export const $players = $gameState.map(state => state.players);
export const $activeSeat = $gameState.map(state => state.activeSeat);
export const $smallBlindSeat = $gameState.map(state => state.smallBlindSeat);
export const $bigBlindSeat = $gameState.map(state => state.bigBlindSeat);
export const $bigBlind = $gameState.map(state => state.bigBlind);
export const $currentBet = $gameState.map(state => state.currentBet);
export const $pot = $gameState.map(state => state.pot);
export const $community = $gameState.map(state => state.community);
export const $round = $gameState.map(state => state.round);

sample({ clock: $bigBlind, target: displayBigBlindChanged });

sample({
  clock: connectGame,
  target: initializeGameFx,
});

sample({
  clock: sendClientCommand,
  target: sendClientCommandFx,
});

const disconnectGameFx = createEffect((socket: WebSocket | null) => {
  resetEventQueue();
  closeOpenGameSocket(socket);
});

sample({
  clock: disconnectGame,
  source: $socketClient,
  target: disconnectGameFx,
});

bindGameQueue({
  emit: incomingEvent,
  readState: () => $gameState.getState(),
  readHandStartedAt: () => $handStartedAt.getState(),
});

watchPlayerActionSounds(incomingEvent);
