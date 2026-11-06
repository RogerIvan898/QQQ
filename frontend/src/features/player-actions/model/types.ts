export type PreAction = 'check' | 'check_fold' | 'call';

export type PreActionDecision = 'check' | 'fold' | 'call';

export interface PreActionOptions {
  canCheck: boolean;
  canCall: boolean;
}

export interface RaisePayload {
  playerId: string;
  amount: number;
}
