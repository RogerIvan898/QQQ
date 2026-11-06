import type { Event } from 'effector';

import { getPlayerActionSound, pokerSoundEngine } from '../lib';

import { SERVER_EVENTS } from './constants';
import type { ServerGameEvent } from './types';

export const watchPlayerActionSounds = (events: Event<ServerGameEvent>) => {
  events.watch(event => {
    if (event.type !== SERVER_EVENTS.PLAYER_ACTED) {
      return;
    }

    void pokerSoundEngine.playAction(
      getPlayerActionSound(event.payload.action, event.payload.status)
    );
  });
};
