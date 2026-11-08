import { createEffect, createEvent, createStore, sample } from 'effector';

import type { CardType as Card } from 'entities/card';
import type { PlayerType as Player } from 'entities/player';
import { DEALER_START_MS } from 'shared/config/table-timing';
import { displayBigBlindChanged } from 'shared/lib/display-settings';

import { watchPlayerActionSounds } from './action-sounds';
import {
  closeOpenGameSocket,
  connectionLost,
  openGameSocket,
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

const initializeGameFx = createEffect((params: GameConnectParams) =>
  openGameSocket(params)
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

export const $isGameLoading = initializeGameFx.pending;

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

export const $handNumber = createStore(0)
  .on(incomingEvent, (count, event) =>
    event.type === SERVER_EVENTS.HAND_STARTED ? count + 1 : count
  )
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

export const $dealerSeat = createStore<number | null>(null)
  .on(moveDealerFx.doneData, (_, seat) => seat)
  .reset(disconnectGame);

sample({
  clock: $actualDealerSeat,
  source: $dealerSeat,
  filter: (shown, actual) => shown !== actual,
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
});

watchPlayerActionSounds(incomingEvent);
