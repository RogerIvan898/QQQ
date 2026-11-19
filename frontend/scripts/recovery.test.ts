import type { EventCallable } from 'effector';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { GameConnectParams } from '../src/entities/game/model/types';
import type { RoomListItem } from '../src/entities/room/model/catalog';

interface TestEvent {
  type: string;
  payload: Record<string, unknown>;
}

interface TestQueue {
  bindGameQueue(api: {
    emit: (event: TestEvent) => void;
    readState: () => { players: Record<string, never> };
    readHandStartedAt: () => number;
  }): void;
  markGameQueueLive(): void;
  resetEventQueue(): void;
  enqueueServerEvent(event: TestEvent): void;
}

type JoinedRoom = { roomId: string; wsUrl: string };

interface TestRuntime {
  window: {
    setTimeout: (fn: () => void, ms: number) => number;
    clearTimeout: (id: number) => void;
    addEventListener: () => void;
    removeEventListener: () => void;
  };
  document: { hidden: boolean; addEventListener: () => void };
  WebSocket: { OPEN: number; CONNECTING: number };
  socketHandlers: { onMessage: (event: TestEvent) => void };
  saved: Map<string, unknown>;
  fixture: {
    roomsChanged: EventCallable<RoomListItem[]>;
    userChanged: EventCallable<string | null>;
    gameModel: { connectGame: EventCallable<GameConnectParams> };
  };
  joinCalls: number;
  joinHandler: (roomId: string) => Promise<JoinedRoom>;
  prepareRoom: EventCallable<JoinedRoom>;
}

const runtime = globalThis as unknown as TestRuntime;

const readSaved = <T>(key: string): T => {
  const value = runtime.saved.get(key);

  assert.notEqual(value, undefined);

  return value as T;
};

async function load<T>(file: string, stubs: string): Promise<T> {
  const source = readFileSync(file, 'utf8');
  const result = await Bun.build({
    entrypoints: ['review:entry'],
    target: 'bun',
    define: { 'import.meta.env.DEV': 'false' },
    plugins: [
      {
        name: 'isolated-fixtures',
        setup(build) {
          build.onResolve({ filter: /^review:entry$/ }, () => ({
            path: 'entry',
            namespace: 'review',
          }));
          build.onLoad({ filter: /.*/, namespace: 'review' }, () => ({
            contents: source,
            loader: 'ts',
            resolveDir: process.cwd(),
          }));
          build.onResolve(
            { filter: /^(shared\/|entities\/|features\/|\.\/|\.\.\/)/ },
            args =>
              args.importer === 'entry'
                ? { path: 'stubs', namespace: 'fixture' }
                : undefined
          );
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: stubs,
            loader: 'js',
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });

  assert.ok(result.success, result.logs.map(log => log.message).join('\n'));

  return import(
    'data:text/javascript;base64,' +
      Buffer.from(await result.outputs[0].text()).toString('base64')
  ) as Promise<T>;
}

const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

let now = 0,
  serial = 0;
const timers = new Map<number, { fn: () => void; at: number }>();

runtime.window = {
  setTimeout: (fn, ms) => {
    timers.set(++serial, { fn, at: now + ms });

    return serial;
  },
  clearTimeout: id => timers.delete(id),
  addEventListener() {},
  removeEventListener() {},
};
runtime.document = { hidden: false, addEventListener() {} };

async function advance(ms: number) {
  now += ms;

  for (const [id, t] of [...timers])
    if (t.at <= now) {
      timers.delete(id);
      t.fn();
    }

  await tick();
}

const queue = await load<TestQueue>(
  'src/entities/game/model/event-queue.ts',
  `
export const Sound = { CARD_REVEAL: '', CHIPS: '' },
  handEndMs = () => 2200,
  HAND_INTRO_MS = 4000,
  WINNER_PAUSE_MS = 250;
export const playBuffered = () => {},
  delay = ms => new Promise(r => window.setTimeout(r, ms));
export const playAllInRunout = async () => true,
  transitionToNextStreet = async () => true,
  getTotalPot = () => 0;
export const SERVER_EVENTS = Object.fromEntries(
  [
    'STREET_CONCLUDED',
    'BOARD_DEALT',
    'HAND_STARTED',
    'HAND_COMPLETED',
    'YOUR_CARDS',
    'SHOWDOWN',
  ].map(x => [x, 'EV_' + x])
);
`
);
const emitted: unknown[] = [];

queue.bindGameQueue({
  emit: e => emitted.push(e.payload.marker),
  readState: () => ({ players: {} }),
  readHandStartedAt: () => now,
});
queue.markGameQueueLive();
queue.enqueueServerEvent({
  type: 'EV_HAND_COMPLETED',
  payload: { marker: 'old' },
});
queue.resetEventQueue();
queue.markGameQueueLive();
queue.enqueueServerEvent({
  type: 'EV_SHOWDOWN',
  payload: { marker: 'showdown' },
});
queue.enqueueServerEvent({
  type: 'EV_HAND_COMPLETED',
  payload: { marker: 'new' },
});
await advance(250);
assert.deepEqual(emitted, ['showdown']);
await advance(350);
await advance(250);
assert.deepEqual(emitted, ['showdown', 'new']);
queue.resetEventQueue();
timers.clear();

const connection = await load<
  typeof import('../src/entities/game/model/connection')
>(
  'src/entities/game/model/connection.ts',
  `
export const getAudioContext = () => ({}),
  preloadSounds = async () => {},
  suspendAudioContext = () => {},
  pokerSoundEngine = {};
export const CLIENT_COMMANDS = { PING: 'CMD_PING' },
  GAME_SOUNDS = [],
  SERVER_EVENTS = {
    TURN_CHANGED: 'EV_TURN_CHANGED',
    HAND_COMPLETED: 'EV_HAND_COMPLETED',
  };
export const enqueueServerEvent = () => {},
  markGameQueueLive = () => {},
  resetEventQueue = () => {};
export const isServerGameEvent = value => typeof value?.type === 'string';
export const createSocket = (url, handlers) => {
  globalThis.socketHandlers = handlers;
  return { readyState: 1, close() {}, send() {} };
};
`
);

runtime.WebSocket = { OPEN: 1, CONNECTING: 0 };
connection.openGameSocket({ wsUrl: 'wss://test' });
runtime.socketHandlers.onMessage({
  type: 'EV_TURN_CHANGED',
  payload: { turnMs: 15000, timeBankMs: 10000 },
});
runtime.socketHandlers.onMessage({ type: 'EV_ALLOWED_ACTIONS', payload: {} });
assert.ok([...timers.values()].some(t => t.at - now === 35000));
runtime.socketHandlers.onMessage({ type: 'EV_HAND_COMPLETED', payload: {} });
assert.ok(![...timers.values()].some(t => t.at - now === 35000));
connection.closeOpenGameSocket(null);
timers.clear();

const fixtureSource = `
import { createEvent, createStore, createEffect } from 'effector';
export const SERVER_EVENTS = { HAND_STARTED: 'start', HAND_COMPLETED: 'end' };
export const gameModel = {
  gameEventApplied: createEvent(),
  connectGame: createEvent(),
  disconnectGame: createEvent(),
};
export const userChanged = createEvent();
export const sessionModel = {
  $currentUserId: createStore(null, { skipVoid: false }).on(userChanged, (_, user) => user),
  $authStatus: createStore('ready'),
  waitForAuth: async () => {},
};
export const roomsChanged = createEvent();
export const $rooms = createStore([]).on(roomsChanged, (_, rooms) => rooms);
export const findRoom = (rooms, id) =>
  rooms.find(r => String(r.id) === String(id));
export const roomBigBlind = r => Number(r.blinds.split('/')[1]),
  roomFormat = max => max + '-Max';
export const readJson = (key, fallback) =>
  globalThis.saved.get(key) ?? fallback;
export const writeJson = (key, value) => globalThis.saved.set(key, value);
globalThis.fixture = { roomsChanged, gameModel, userChanged };
`;

runtime.saved = new Map([
  [
    'poker:game-session-draft:100',
    {
      id: 'legacy',
      roomId: '1',
      hands: 3,
      buyInChips: 1000,
      stackChips: 1200,
      bigBlindChips: 10,
    },
  ],
]);

const sessions = await load<
  typeof import('../src/features/game-sessions/model/sessions')
>('src/features/game-sessions/model/sessions.ts', fixtureSource);

let observedSessions: typeof sessions.$sessions.defaultState = [];
const stopObserving = sessions.$sessions.watch(value => {
  observedSessions = value;
});

runtime.fixture.userChanged('100');
assert.equal(observedSessions.length, 0);
assert.equal(readSaved<unknown[]>('poker:game-session-recovery:100').length, 1);
runtime.fixture.roomsChanged([
  {
    id: 1,
    name: 'Test',
    mode: 'cash',
    blinds: '0.05/0.1',
    max: 6,
    players: 0,
    minBuy: 1,
    maxBuy: 10,
  },
]);
assert.equal(observedSessions[0].net, 2);
assert.equal(readSaved<unknown[]>('poker:game-session-recovery:100').length, 0);
runtime.fixture.userChanged('101');
assert.equal(observedSessions.length, 0);
runtime.fixture.userChanged('100');
assert.equal(observedSessions[0].net, 2);
console.log(
  'Recovery regressions passed: queue cancellation, watchdog, legacy session recovery'
);

sessions.sessionStarted('1');
assert.equal(
  readSaved<{ roomBigBlindTon: number }>('poker:game-session-draft:100')
    .roomBigBlindTon,
  0.1
);
sessions.sessionEnded();
stopObserving();

const gate = await load<
  typeof import('../src/pages/game-room/model/game-room')
>(
  'src/pages/game-room/model/game-room.ts',
  fixtureSource +
    `
export const gameSessionsModel = {
  sessionStarted: createEvent(),
  sessionEnded: createEvent(),
};
export const handHistoryModel = {
  tableEntered: createEvent(),
  tableLeft: createEvent(),
};
export const setTonConnectPaused = () => {};
const prepared = createEvent();
globalThis.prepareRoom = prepared;
export const clearJoinedRoom = createEvent();
export const $joinedRoom = createStore(null, { skipVoid: false }).on(prepared, (_, room) => room).reset(clearJoinedRoom);
export const joinRoomFx = createEffect(roomId => {
  globalThis.joinCalls++;
  return globalThis.joinHandler(roomId);
});
`
);
const connects: GameConnectParams[] = [];

runtime.fixture.gameModel.connectGame.watch(p => connects.push(p));
runtime.joinCalls = 0;
runtime.joinHandler = () =>
  Promise.resolve({ roomId: '1', wsUrl: 'wss://fresh' });
gate.GamePageGate.open({ roomId: '1' });
await tick();
assert.equal(runtime.joinCalls, 1);
assert.equal(connects[0].wsUrl, 'wss://fresh');
gate.GamePageGate.close({ roomId: '1' });
runtime.prepareRoom({ roomId: '1', wsUrl: 'wss://prepared' });
gate.GamePageGate.open({ roomId: '1' });
await tick();
assert.equal(runtime.joinCalls, 1);
assert.equal(connects[1].wsUrl, 'wss://prepared');
gate.GamePageGate.close({ roomId: '1' });

let resolveJoin: (room: JoinedRoom) => void = () => {
  throw new Error('Join has not started');
};

runtime.joinHandler = () =>
  new Promise(resolve => {
    resolveJoin = resolve;
  });
gate.GamePageGate.open({ roomId: '1' });
await tick();
gate.GamePageGate.close({ roomId: '1' });
resolveJoin({ roomId: '1', wsUrl: 'wss://late' });
await tick();
assert.equal(connects.length, 2);
console.log(
  'Table entry regressions passed: cold entry, prepared entry, leave during join'
);
