import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

async function load(file, stubs) {
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
  assert.ok(result.success, String(result.logs));
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(await result.outputs[0].text()).toString('base64')
  );
}
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
let now = 0,
  serial = 0;
const timers = new Map();
globalThis.window = {
  setTimeout: (fn, ms) => {
    timers.set(++serial, { fn, at: now + ms });
    return serial;
  },
  clearTimeout: id => timers.delete(id),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = { hidden: false, addEventListener() {} };
async function advance(ms) {
  now += ms;
  for (const [id, t] of [...timers])
    if (t.at <= now) {
      timers.delete(id);
      t.fn();
    }
  await tick();
}
const queue = await load(
  'src/entities/game/model/event-queue.ts',
  `
export const Sound={CARD_REVEAL:'',CHIPS:''}, handEndMs=()=>2200, HAND_INTRO_MS=4000, WINNER_PAUSE_MS=250;
export const playBuffered=()=>{}, delay=ms=>new Promise(r=>window.setTimeout(r,ms));
export const playAllInRunout=async()=>true, transitionToNextStreet=async()=>true, getTotalPot=()=>0;
export const SERVER_EVENTS=Object.fromEntries(['STREET_CONCLUDED','BOARD_DEALT','HAND_STARTED','HAND_COMPLETED','YOUR_CARDS','SHOWDOWN'].map(x=>[x,'EV_'+x]));`
);
const emitted = [];
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

const connection = await load(
  'src/entities/game/model/connection.ts',
  `
export const getAudioContext=()=>({}), preloadSounds=async()=>{}, suspendAudioContext=()=>{}, pokerSoundEngine={};
export const CLIENT_COMMANDS={PING:'CMD_PING'}, GAME_SOUNDS=[], SERVER_EVENTS={TURN_CHANGED:'EV_TURN_CHANGED',HAND_COMPLETED:'EV_HAND_COMPLETED'};
export const enqueueServerEvent=()=>{}, markGameQueueLive=()=>{}, resetEventQueue=()=>{};
export const createSocket=(url,handlers)=>{globalThis.socketHandlers=handlers;return {readyState:1,close(){},send(){}}};`
);
globalThis.WebSocket = { OPEN: 1, CONNECTING: 0 };
connection.openGameSocket({ wsUrl: 'wss://test' });
socketHandlers.onMessage({
  type: 'EV_TURN_CHANGED',
  payload: { turnMs: 15000, timeBankMs: 10000 },
});
socketHandlers.onMessage({ type: 'EV_ALLOWED_ACTIONS', payload: {} });
assert.ok([...timers.values()].some(t => t.at - now === 35000));
socketHandlers.onMessage({ type: 'EV_HAND_COMPLETED', payload: {} });
assert.ok(![...timers.values()].some(t => t.at - now === 35000));
connection.closeOpenGameSocket(null);
timers.clear();

const fixtureSource = `
import {createEvent,createStore,createEffect} from 'effector';
export const SERVER_EVENTS={HAND_STARTED:'start',HAND_COMPLETED:'end'};
export const gameModel={incomingEvent:createEvent(),$gameState:createStore({players:{}}),connectGame:createEvent(),disconnectGame:createEvent()};
export const sessionModel={$currentUserId:createStore('100'),waitForAuth:async()=>{}};
export const roomsChanged=createEvent();
export const $rooms=createStore([]).on(roomsChanged,(_,rooms)=>rooms);
export const findRoom=(rooms,id)=>rooms.find(r=>String(r.id)===String(id));
export const roomBigBlind=r=>Number(r.blinds.split('/')[1]),roomFormat=max=>max+'-Max';
export const readJson=(key,fallback)=>globalThis.saved.get(key)??fallback;
export const writeJson=(key,value)=>globalThis.saved.set(key,value);
globalThis.fixture={roomsChanged,gameModel};
`;
globalThis.saved = new Map([
  [
    'poker:game-session-draft',
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
const sessions = await load(
  'src/features/game-sessions/model/sessions.ts',
  fixtureSource
);
assert.equal(sessions.$sessions.getState().length, 0);
assert.equal(saved.get('poker:game-session-recovery').length, 1);
globalThis.fixture.roomsChanged([{ id: 1, blinds: '0.05/0.1', max: 6 }]);
assert.equal(sessions.$sessions.getState()[0].net, 2);
assert.equal(saved.get('poker:game-session-recovery').length, 0);
console.log(
  'Recovery regressions passed: queue cancellation, watchdog, legacy session recovery'
);

sessions.sessionStarted('1');
assert.equal(saved.get('poker:game-session-draft').roomBigBlindTon, 0.1);
sessions.sessionEnded();

const gate = await load(
  'src/pages/game-room/model/game-room.ts',
  fixtureSource +
    `
export const gameSessionsModel={sessionStarted:createEvent(),sessionEnded:createEvent()};
export const handHistoryModel={tableEntered:createEvent(),tableLeft:createEvent()};
export const setTonConnectPaused=()=>{};
export const consumeJoinedRoom=()=>{const room=globalThis.prepared;globalThis.prepared=null;return room;};
export const joinRoomFx=createEffect(roomId=>{globalThis.joinCalls++;return globalThis.joinHandler(roomId);});
`
);
let connects = [];
globalThis.fixture.gameModel.connectGame.watch(p => connects.push(p));
globalThis.joinCalls = 0;
globalThis.joinHandler = async () => ({ roomId: '1', wsUrl: 'wss://fresh' });
gate.GamePageGate.open({ roomId: '1' });
await tick();
assert.equal(joinCalls, 1);
assert.equal(connects[0].wsUrl, 'wss://fresh');
gate.GamePageGate.close({ roomId: '1' });
globalThis.prepared = { roomId: '1', wsUrl: 'wss://prepared' };
gate.GamePageGate.open({ roomId: '1' });
await tick();
assert.equal(joinCalls, 1);
assert.equal(connects[1].wsUrl, 'wss://prepared');
gate.GamePageGate.close({ roomId: '1' });
let resolveJoin;
globalThis.joinHandler = () =>
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
