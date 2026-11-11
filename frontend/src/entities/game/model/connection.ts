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

export const prepareGameAudio = async () => {
  const audioContext = getAudioContext();
  pokerSoundEngine.init(audioContext);
  trackVisibility();

  if (audioContext.state !== 'running') {
    resumeAudio();
    armAudioUnlock();
  }

  return preloadSounds(GAME_SOUNDS);
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const CONNECT_TIMEOUT_MS = 10000;

let reconnectAttempt = 0;
let reconnectTimer: number | undefined;
let waitingForNetwork: (() => void) | null = null;

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

  const wait = backoff / 2 + Math.random() * (backoff / 2);

  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    if (id !== connectionId) return;

    resetEventQueue();
    openSocket = createGameSocket(wsUrl, id);
    queueMicrotask(markGameQueueLive);
  }, wait);
};

const createGameSocket = (wsUrl: string, id: number): WebSocket => {
  const socket = createSocket(wsUrl, {
    onOpen: () => {
      window.clearTimeout(connectTimer);
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
      window.clearTimeout(connectTimer);

      if (id === connectionId && openSocket === socket) {
        openSocket = null;
        scheduleReconnect(wsUrl, id);
      }
    },
  });

  const connectTimer = window.setTimeout(() => {
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }, CONNECT_TIMEOUT_MS);

  return socket;
};

const reconnectNow = () => {
  if (!activeWsUrl || openSocket?.readyState === WebSocket.OPEN) {
    return;
  }

  if (openSocket?.readyState === WebSocket.CONNECTING) {
    return;
  }

  reconnectAttempt = 0;
  scheduleImmediate(activeWsUrl, connectionId);
};

const scheduleImmediate = (wsUrl: string, id: number) => {
  stopReconnecting();
  resetEventQueue();
  openSocket = createGameSocket(wsUrl, id);
  queueMicrotask(markGameQueueLive);
};

let activeWsUrl: string | null = null;
let resumeTracked = false;

const trackResume = () => {
  if (resumeTracked) return;

  resumeTracked = true;
  window.addEventListener('online', reconnectNow);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      reconnectNow();
    }
  });
};

export const sendToGameSocket = (command: unknown) => {
  if (openSocket?.readyState !== WebSocket.OPEN) {
    return false;
  }

  openSocket.send(JSON.stringify(command));
  return true;
};

export const openGameSocket = ({ wsUrl }: GameConnectParams) => {
  connectionId += 1;
  const currentId = connectionId;

  stopReconnecting();
  reconnectAttempt = 0;
  connectionLost(false);
  resetEventQueue();
  openSocket?.close();
  openSocket = null;
  activeWsUrl = wsUrl;
  trackResume();
  const socket = createGameSocket(wsUrl, currentId);
  openSocket = socket;
  queueMicrotask(markGameQueueLive);
  return socket;
};

export const closeOpenGameSocket = (socket: WebSocket | null) => {
  connectionId += 1;
  activeWsUrl = null;
  stopReconnecting();
  connectionLost(false);
  openSocket?.close();
  openSocket = null;
  socket?.close();
  suspendAudioContext();
};
