import { delay } from 'shared/utils/delay';

const READ_ACTION_MS = 700;
const COLLECT_CHIPS_MS = 450;
const CARD_GAP_MS = 180;
const BEFORE_TURN_MS = 400;

export interface StreetTransitionActions {
  hadBets: boolean;
}

export interface StreetTransitionEffects {
  cancelled: () => boolean;
  collectToPot: () => void;
  applyStreet: () => void;
  revealCards: (cards: string[]) => void;
}

export const transitionToNextStreet = async (
  actions: StreetTransitionActions,
  nextCards: string[],
  potSize: number,
  effects: StreetTransitionEffects
) => {
  await delay(READ_ACTION_MS);

  if (effects.cancelled()) {
    return false;
  }

  if (actions.hadBets || potSize > 0) {
    effects.collectToPot();
    await delay(COLLECT_CHIPS_MS);

    if (effects.cancelled()) {
      return false;
    }
  }

  effects.applyStreet();

  if (effects.cancelled()) {
    return false;
  }

  const shown: string[] = [];

  for (const card of nextCards) {
    shown.push(card);
    effects.revealCards([...shown]);
    await delay(CARD_GAP_MS);

    if (effects.cancelled()) {
      return false;
    }
  }

  await delay(BEFORE_TURN_MS);

  return !effects.cancelled();
};
