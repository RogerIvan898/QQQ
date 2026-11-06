import { delay } from 'shared/utils/delay';

import type { GameStreet } from './types';

const BADGE_MS = 500;
const GATHER_MS = 450;
const TENSION_MS = 700;
const STREET_MS = 800;
const CARD_GAP_MS = 180;
const WIN_MS = 1000;

export interface RunoutStreet {
  street: GameStreet;
  cards: string[];
}

export interface AllInRunoutScript {
  hadBets: boolean;
  potSize: number;
  showdown: boolean;
  streets: RunoutStreet[];
}

export interface AllInRunoutEffects {
  cancelled: () => boolean;
  collectToPot: () => void;
  applyStreet: () => void;
  revealHands: () => void;
  dealStreet: (street: GameStreet, cards: string[]) => void;
  declareWinner: () => void;
}

const stopped = (effects: AllInRunoutEffects) => effects.cancelled();

export const allInRunoutDuration = (streets: RunoutStreet[]) => {
  const cardGaps = streets.reduce(
    (sum, street) => sum + (street.street === 'FLOP' ? street.cards.length : 1),
    0
  );

  return (
    BADGE_MS +
    GATHER_MS +
    TENSION_MS +
    cardGaps * CARD_GAP_MS +
    Math.max(0, streets.length - 1) * STREET_MS +
    WIN_MS
  );
};

export const playAllInRunout = async (
  script: AllInRunoutScript,
  effects: AllInRunoutEffects
) => {
  await delay(BADGE_MS);

  if (stopped(effects)) {
    return false;
  }

  if (script.hadBets || script.potSize > 0) {
    effects.collectToPot();
    await delay(GATHER_MS);

    if (stopped(effects)) {
      return false;
    }
  }

  effects.applyStreet();

  if (script.showdown) {
    effects.revealHands();
    await delay(TENSION_MS);

    if (stopped(effects)) {
      return false;
    }
  }

  for (let index = 0; index < script.streets.length; index += 1) {
    const street = script.streets[index];

    if (!street) {
      continue;
    }

    if (street.street === 'FLOP') {
      const shown: string[] = [];

      for (const card of street.cards) {
        shown.push(card);
        effects.dealStreet('FLOP', [...shown]);
        await delay(CARD_GAP_MS);

        if (stopped(effects)) {
          return false;
        }
      }
    } else {
      effects.dealStreet(street.street, street.cards);
      await delay(CARD_GAP_MS);

      if (stopped(effects)) {
        return false;
      }
    }

    if (index < script.streets.length - 1) {
      await delay(STREET_MS);

      if (stopped(effects)) {
        return false;
      }
    }
  }

  effects.declareWinner();
  await delay(WIN_MS);

  return !stopped(effects);
};
