import {
  combine,
  createEffect,
  createEvent,
  createStore,
  sample,
} from 'effector';
import { delay } from 'patronum/delay';

import type { CardType as Card } from 'entities/card';
import type { PlayerType as Player } from 'entities/player';
import {
  DEFAULT_GAME_VARIANT,
  type GameVariant,
} from 'shared/config/game-variant';
import { DEAL_START_MS, DEALER_START_MS } from 'shared/config/table-timing';
import { displayBigBlindChanged } from 'shared/lib/display-settings';

import { watchPlayerActionSounds } from './action-sounds';
import {
  closeOpenGameSocket,
  connectionLost,
  openGameSocket,
  prepareGameAudio,
  sendToGameSocket,
  serverEventReceived,
} from './connection';
import {
  CLIENT_COMMANDS,
  INITIAL_GAME_STATE,
  SERVER_EVENTS,
} from './constants';
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

const initializeGameFx = createEffect(openGameSocket);
const prepareAudioFx = createEffect(prepareGameAudio);

const sendClientCommandFx = createEffect((command: unknown) => {
  if (!sendToGameSocket(command)) {
    console.warn('[WS] Cannot send action: socket is not open');
  }
});

export const connectGame = createEvent<GameConnectParams>();
export const sendClientCommand = createEvent<ClientGameEvent>();
export const disconnectGame = createEvent();

// Accounting follows the wire order, even while the table is still animating.
const $serverState = createStore(INITIAL_GAME_STATE)
  .on(serverEventReceived, reduceGameEvent)
  .reset(connectGame, disconnectGame);

export const gameEventApplied = sample({
  clock: serverEventReceived,
  source: $serverState,
  fn: (state, event) => ({ state, event }),
});

const $socketClient = createStore<WebSocket | null>(null)
  .on(initializeGameFx.doneData, (_, socket) => socket)
  .reset(disconnectGame);

export const gameConnectionInterrupted = sample({
  clock: connectionLost,
  filter: lost => lost,
});

const $connectAttempt = createStore(0).on(
  [connectGame, disconnectGame, gameConnectionInterrupted],
  n => n + 1
);

const $connecting = createStore(false)
  .on(connectGame, () => true)
  .reset(disconnectGame);

const $tableReady = createStore(false)
  .on(
    serverEventReceived,
    (ready, event) =>
      ready ||
      event.type === SERVER_EVENTS.PLAYER_SEATED ||
      event.type === SERVER_EVENTS.HAND_STARTED
  )
  .reset(connectGame, disconnectGame);

const tableWaitElapsed = delay(
  sample({
    clock: [connectGame, gameConnectionInterrupted],
    source: $connectAttempt,
  }),
  TABLE_WAIT_MS
);

sample({
  clock: tableWaitElapsed,
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

export const $gameVariant = createStore<GameVariant>(DEFAULT_GAME_VARIANT)
  .on(connectGame, (_, { game }) => game ?? DEFAULT_GAME_VARIANT)
  .on(serverEventReceived, (variant, event) =>
    event.type === SERVER_EVENTS.HAND_STARTED && event.payload.game
      ? event.payload.game
      : variant
  )
  .reset(disconnectGame);

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

export const tableAnimationEvent = sample({
  clock: incomingEvent,
  source: $showdownThisHand,
  fn: (showdown, event) => ({ showdown, event }),
});

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

export const $debugHoles = createStore<Record<number, readonly Card[]>>({})
  .on(incomingEvent, reduceDebugHoles)
  .reset(disconnectGame);

export const $myCards = createStore<Player['hand']>(null)
  .on(incomingEvent, reduceMyCards)
  .reset(disconnectGame);

const turnPermissions = () =>
  createStore<AllowedPlayerActionsEvent['payload'] | null>(null).reset(
    connectGame,
    disconnectGame,
    gameConnectionInterrupted
  );

const $receivedActions = turnPermissions().on(
  serverEventReceived,
  reduceAllowedActions
);
const $displayedActions = turnPermissions().on(
  incomingEvent,
  reduceAllowedActions
);

export const $myAllowedActions = combine(
  $receivedActions,
  $displayedActions,
  (received, displayed) => (received === displayed ? received : null)
);

const $actualDealerSeat = $gameState.map(state => state.dealerSeat);

const placeDealer = createEvent<number | null>();

export const $dealerSeat = createStore<number | null>(null)
  .on(placeDealer, (_, seat) => seat)
  .reset(disconnectGame);

sample({
  clock: $actualDealerSeat,
  source: $dealerSeat,
  filter: (shown, actual) => shown === null && actual !== null,
  fn: (_, actual) => actual,
  target: placeDealer,
});

const dealerMoveRequested = sample({
  clock: $actualDealerSeat,
  source: { shown: $dealerSeat, generation: $connectAttempt },
  filter: ({ shown }, actual) => shown !== null && shown !== actual,
  fn: ({ generation }, seat) => ({ generation, seat }),
});

sample({
  clock: delay(dealerMoveRequested, DEALER_START_MS),
  source: { generation: $connectAttempt, actual: $actualDealerSeat },
  filter: ({ generation, actual }, move) =>
    generation === move.generation && actual === move.seat,
  fn: (_, { seat }) => seat,
  target: placeDealer,
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
  target: [initializeGameFx, prepareAudioFx],
});

sample({
  clock: sendClientCommand,
  source: { allowed: $myAllowedActions, lost: $connectionLost },
  filter: ({ allowed, lost }, command) =>
    !lost &&
    (command.type !== CLIENT_COMMANDS.PLAYER_ACTION || allowed !== null),
  fn: (_, command) => command,
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

// The animation queue runs outside Effector and consumes the live table snapshots.
let queueState = INITIAL_GAME_STATE;
let queueHandStartedAt = 0;

$gameState.watch(state => {
  queueState = state;
});
$handStartedAt.watch(startedAt => {
  queueHandStartedAt = startedAt;
});

bindGameQueue({
  emit: incomingEvent,
  readState: () => queueState,
  readHandStartedAt: () => queueHandStartedAt,
});

watchPlayerActionSounds(incomingEvent);
