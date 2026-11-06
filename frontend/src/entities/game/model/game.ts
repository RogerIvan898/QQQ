import { createEffect, createEvent, createStore, sample } from 'effector';

import type { CardType as Card } from 'entities/card';
import type { PlayerType as Player } from 'entities/player';

import { watchPlayerActionSounds } from './action-sounds';
import { closeOpenGameSocket, openGameSocket } from './connection';
import { INITIAL_GAME_STATE } from './constants';
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

const sendClientCommandFx = createEffect(
  ({ socket, command }: { socket: WebSocket | null; command: unknown }) => {
    if (!socket) {
      console.warn('[WS] Cannot send action: socket is disconnected');

      return;
    }

    socket.send(JSON.stringify(command));
  }
);

export const connectGame = createEvent<GameConnectParams>();
export const sendClientCommand = createEvent<ClientGameEvent>();
export const disconnectGame = createEvent();

const $socketClient = createStore<WebSocket | null>(null)
  .on(initializeGameFx.doneData, (_, socket) => socket)
  .reset(disconnectGame);

export const $isGameLoading = initializeGameFx.pending;

export const $gameState = createStore(INITIAL_GAME_STATE)
  .on(incomingEvent, reduceGameEvent)
  .on(clearActiveSeat, state => ({ ...state, activeSeat: null }))
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

export const $dealerSeat = $gameState.map(state => state.dealerSeat);
export const $players = $gameState.map(state => state.players);
export const $activeSeat = $gameState.map(state => state.activeSeat);
export const $smallBlindSeat = $gameState.map(state => state.smallBlindSeat);
export const $bigBlindSeat = $gameState.map(state => state.bigBlindSeat);
export const $bigBlind = $gameState.map(state => state.bigBlind);
export const $currentBet = $gameState.map(state => state.currentBet);
export const $pot = $gameState.map(state => state.pot);
export const $community = $gameState.map(state => state.community);
export const $round = $gameState.map(state => state.round);

sample({
  clock: connectGame,
  target: initializeGameFx,
});

sample({
  clock: sendClientCommand,
  source: $socketClient,
  fn: (socket, command) => ({ socket, command }),
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
