import type { PokerSoundAction, SoundRecipe } from './types';

export const ACTION_SOUND_RECIPES: Record<PokerSoundAction, SoundRecipe> = {
  fold: { clicks: [], swoosh: true },
  check: { clicks: [{ pitch: 1, volume: 1, soft: true }], swoosh: false },
  call: { clicks: [{ pitch: 1, volume: 0.25, soft: false }], swoosh: false },

  bet: { clicks: [], swoosh: false },
  allin: { clicks: [], swoosh: false },
};
