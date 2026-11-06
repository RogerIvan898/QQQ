import {
  createEffect,
  createEvent,
  createStore,
  merge,
  sample,
} from 'effector';

import { gameModel, SERVER_EVENTS } from 'entities/game';
import { findPlayerById } from 'entities/player';
import { sessionModel } from 'entities/session';

import { call, check, fold, raise } from './actions';
import {
  canPreAct,
  chipsToCall,
  decidePreAction,
  isPreActionStale,
} from './pre-action-rules';
import type { PreAction, PreActionDecision, PreActionOptions } from './types';

export const setPreAction = createEvent<PreAction | null>();
export const clearPreAction = createEvent();

export const $preAction = createStore<PreAction | null>(null)
  .on(setPreAction, (_, action) => action)
  .reset(clearPreAction);

const runDecision = (decision: PreActionDecision) => {
  if (decision === 'check') {
    check();
    return;
  }

  if (decision === 'fold') {
    fold();
    return;
  }

  call();
};

let running = false;

const runPreActionFx = createEffect(
  ([preAction, allowed]: [PreAction, PreActionOptions]) => {
    if (running) {
      return;
    }

    running = true;

    try {
      const decision = decidePreAction(preAction, allowed);

      if (decision) {
        runDecision(decision);
      }
    } finally {
      running = false;
    }
  }
);

sample({
  clock: gameModel.$myAllowedActions,
  source: $preAction,
  filter: (preAction, allowed) => preAction !== null && allowed !== null,
  fn: (preAction, allowed) =>
    [preAction, allowed] as [PreAction, PreActionOptions],
  target: runPreActionFx,
});

sample({
  clock: gameModel.$myAllowedActions,
  source: $preAction,
  filter: (preAction, allowed) => preAction !== null && allowed !== null,
  target: clearPreAction,
});

sample({
  clock: gameModel.$gameState,
  source: {
    preAction: $preAction,
    userId: sessionModel.$currentUserId,
  },
  filter: ({ preAction, userId }, state) => {
    if (!preAction || !userId) {
      return false;
    }

    const viewer = findPlayerById(state.players, userId);

    if (!viewer || !canPreAct(viewer.status)) {
      return true;
    }

    return isPreActionStale(
      preAction,
      chipsToCall(state.currentBet, viewer.committed, viewer.stack)
    );
  },
  target: clearPreAction,
});

sample({
  clock: merge([fold, call, check, raise]),
  target: clearPreAction,
});

sample({
  clock: gameModel.incomingEvent,
  filter: event =>
    event.type === SERVER_EVENTS.HAND_STARTED ||
    event.type === SERVER_EVENTS.HAND_COMPLETED,
  target: clearPreAction,
});

sample({
  clock: gameModel.disconnectGame,
  target: clearPreAction,
});
