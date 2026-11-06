export type PokerSoundAction = 'fold' | 'check' | 'call' | 'bet' | 'allin';

export interface ClickRecipe {
  pitch: number;
  volume: number;
  soft: boolean;
  delay?: number;
}

export interface SoundRecipe {
  clicks: ClickRecipe[];
  swoosh: boolean;
  rumble?: boolean;
}
