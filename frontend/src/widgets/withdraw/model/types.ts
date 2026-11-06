export type WithdrawDestination = 'wallet' | 'address';

export type WithdrawPayload = {
  amount: number;
  address: string;
  destination: WithdrawDestination;
};
