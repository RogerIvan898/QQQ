import { createEvent } from 'effector';

import {
  getAudioContext,
  preloadSounds,
  suspendAudioContext,
} from 'shared/lib/audio';
import { createSocket } from 'shared/lib/websocket';

import { pokerSoundEngine } from '../lib';

import { GAME_SOUNDS } from './constants';
import {
  enqueueServerEvent,
  markGameQueueLive,
  resetEventQueue,
} from './event-queue';
import type { GameConnectParams, ServerGameEvent } from './types';

let openSocket: WebSocket | null = null;
let connectionId = 0;

const isServerGameEvent = (data: unknown): data is ServerGameEvent =>
  typeof data === 'object' && data !== null && 'type' in data;

let unlockArmed = false;
let visibilityTracked = false;

const resumeAudio = () => {
  void getAudioContext()
    .resume()
    .catch(() => undefined);
};

// One pair of listeners at most: reconnecting without a user gesture used to
// add another pair on every connect.
const armAudioUnlock = () => {
  if (unlockArmed) return;

  unlockArmed = true;

  const unlock = () => {
    unlockArmed = false;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    resumeAudio();
  };

  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
};

// A running AudioContext keeps the audio thread busy; pause it while the
// Mini App is in the background and resume only if a table is open.
const trackVisibility = () => {
  if (visibilityTracked) return;

  visibilityTracked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      suspendAudioContext();
    } else if (openSocket) {
      resumeAudio();
    }
  });
};

const initializeAudio = async () => {
  const audioContext = getAudioContext();
  pokerSoundEngine.init(audioContext);
  trackVisibility();

  // resume() stays pending until a user gesture, so don't block preloading
  // on it; decoding works on a suspended context.
  if (audioContext.state !== 'running') {
    resumeAudio();
    armAudioUnlock();
  }

  return preloadSounds(GAME_SOUNDS);
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

let reconnectAttempt = 0;
let reconnectTimer: number | undefined;
let waitingForNetwork: (() => void) | null = null;

/** True while the table is open but the socket is down and being retried. */
export const connectionLost = createEvent<boolean>();

const stopReconnecting = () => {
  window.clearTimeout(reconnectTimer);
  reconnectTimer = undefined;

  if (waitingForNetwork) {
    window.removeEventListener('online', waitingForNetwork);
    waitingForNetwork = null;
  }
};

const scheduleReconnect = (wsUrl: string, id: number) => {
  stopReconnecting();

  if (id !== connectionId) return;

  connectionLost(true);

  // No point retrying offline: wait for the network to come back.
  if (!navigator.onLine) {
    waitingForNetwork = () => {
      waitingForNetwork = null;
      scheduleReconnect(wsUrl, id);
    };
    window.addEventListener('online', waitingForNetwork, { once: true });
    return;
  }

  const backoff = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * 2 ** reconnectAttempt
  );
  // Jitter so a server restart is not hit by every client at once.
  const wait = backoff / 2 + Math.random() * (backoff / 2);

  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    if (id !== connectionId) return;

    // Whatever was mid-animation belongs to the old connection.
    resetEventQueue();
    openSocket = createGameSocket(wsUrl, id);
    queueMicrotask(markGameQueueLive);
  }, wait);
};

const createGameSocket = (wsUrl: string, id: number): WebSocket =>
  createSocket(wsUrl, {
    onOpen: () => {
      reconnectAttempt = 0;
      connectionLost(false);
    },
    onMessage: data => {
      if (isServerGameEvent(data)) {
        enqueueServerEvent(data);
      } else {
        console.warn('[WS] Received non-game event:', data);
      }
    },
    onClose: () => {
      // A close we asked for bumps connectionId first, so it is ignored here.
      if (id === connectionId) {
        openSocket = null;
        scheduleReconnect(wsUrl, id);
      }
    },
  });

/** Sends a command if the socket is open; returns false otherwise. */
export const sendToGameSocket = (command: unknown) => {
  if (openSocket?.readyState !== WebSocket.OPEN) {
    return false;
  }

  openSocket.send(JSON.stringify(command));
  return true;
};

export const openGameSocket = async ({ wsUrl }: GameConnectParams) => {
  connectionId += 1;
  const currentId = connectionId;

  stopReconnecting();
  reconnectAttempt = 0;
  connectionLost(false);
  resetEventQueue();
  openSocket?.close();
  openSocket = null;
  await initializeAudio();

  if (currentId !== connectionId) {
    return null;
  }

  const socket = createGameSocket(wsUrl, currentId);
  openSocket = socket;
  queueMicrotask(markGameQueueLive);
  return socket;
};

export const closeOpenGameSocket = (socket: WebSocket | null) => {
  connectionId += 1;
  stopReconnecting();
  connectionLost(false);
  openSocket?.close();
  openSocket = null;
  socket?.close();
  suspendAudioContext();
};
