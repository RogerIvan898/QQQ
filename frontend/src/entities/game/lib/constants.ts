import type { PokerSoundAction, SoundRecipe } from './types';

export const ACTION_SOUND_RECIPES: Record<PokerSoundAction, SoundRecipe> = {
  fold: { clicks: [], swoosh: true },
  check: { clicks: [{ pitch: 1, volume: 1, soft: true }], swoosh: false },
  call: { clicks: [{ pitch: 1, volume: 0.25, soft: false }], swoosh: false },
  // Bet/raise and all-in sounds are muted for now. To restore:
  //   bet:   clicks [{ pitch: 1.25, volume: 0.28, soft: false }]
  //   allin: clicks [{ pitch: 1.25, volume: 0.28, soft: false },
  //                  { pitch: 0.9, volume: 0.17, soft: false, delay: 0.055 }],
  //          rumble: true
  bet: { clicks: [], swoosh: false },
  allin: { clicks: [], swoosh: false },
};
