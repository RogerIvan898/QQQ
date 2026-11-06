import { getAudioContext, preloadSounds } from 'shared/lib/audio';
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

const initializeAudio = async () => {
  const audioContext = getAudioContext();
  pokerSoundEngine.init(audioContext);

  // resume() stays pending until a user gesture, so don't block preloading
  // on it; decoding works on a suspended context.
  if (audioContext.state !== 'running') {
    void audioContext.resume().catch(() => undefined);

    const unlock = () => {
      void audioContext.resume().catch(() => undefined);
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  return preloadSounds(GAME_SOUNDS);
};

const createGameSocket = (wsUrl: string) =>
  createSocket(wsUrl, {
    onMessage: data => {
      if (isServerGameEvent(data)) {
        enqueueServerEvent(data);
      } else {
        console.warn('[WS] Received non-game event:', data);
      }
    },
  });

export const openGameSocket = async ({ wsUrl }: GameConnectParams) => {
  connectionId += 1;
  const currentId = connectionId;

  resetEventQueue();
  openSocket?.close();
  openSocket = null;
  await initializeAudio();

  if (currentId !== connectionId) {
    return null;
  }

  const socket = createGameSocket(wsUrl);
  openSocket = socket;
  queueMicrotask(markGameQueueLive);
  return socket;
};

export const closeOpenGameSocket = (socket: WebSocket | null) => {
  connectionId += 1;
  openSocket?.close();
  openSocket = null;
  socket?.close();
};
