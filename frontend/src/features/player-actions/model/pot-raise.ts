export interface BetPreset {
  label: string;
  value: number;
}

export const potRaiseTo = (
  fraction: number,
  pot: number,
  callAmount: number,
  committed: number
) => committed + callAmount + fraction * (pot + callAmount);
