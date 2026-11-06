import cardDealSound from 'shared/assets/sounds/card-deal.mp3';
import cardRevealSound from 'shared/assets/sounds/card-reveal.mp3';
import checkSound from 'shared/assets/sounds/check.mp3';
import chipsSound from 'shared/assets/sounds/chips.mp3';
import timeBankSound from 'shared/assets/sounds/time-bank.mp3';

export const Sound = {
  CARD_DEAL: cardDealSound,
  CARD_REVEAL: cardRevealSound,
  CHECK: checkSound,
  CHIPS: chipsSound,
  TIME_BANK: timeBankSound,
} as const;
