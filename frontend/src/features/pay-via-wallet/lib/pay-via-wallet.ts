import { TON_CHAIN_ID } from 'shared/config/ton-network';
import { toNanoSafe } from 'shared/lib/ton';
import { getTonConnectUI } from 'shared/lib/ton-connect';

export class WrongNetworkError extends Error {
  constructor() {
    super('Wallet is on another network');
  }
}

export interface WalletPaymentRequest {
  amount: number;
  depositAddress: string;
  memo?: string;
}

export const payViaWallet = async (
  { amount, depositAddress, memo }: WalletPaymentRequest,
  walletChain: string | null
): Promise<'wallet-opened' | 'invalid-amount' | 'sent'> => {
  const tonConnectUI = await getTonConnectUI();

  if (walletChain === null) {
    await tonConnectUI.openModal();

    return 'wallet-opened';
  }

  if (walletChain !== TON_CHAIN_ID) {
    throw new WrongNetworkError();
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return 'invalid-amount';
  }

  // Load the TON codec only when preparing a transaction.
  const { Address, beginCell } = await import('@ton/core');
  const address = depositAddress.trim();

  if (!Address.isFriendly(address) && !Address.isRaw(address)) {
    throw new Error('Invalid deposit address');
  }

  const payload = memo
    ? beginCell()
        .storeUint(0, 32)
        .storeStringTail(memo)
        .endCell()
        .toBoc()
        .toString('base64')
    : undefined;

  await tonConnectUI.sendTransaction({
    network: TON_CHAIN_ID,
    validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
    messages: [{ address, amount: toNanoSafe(amount).toString(), payload }],
  });

  return 'sent';
};
