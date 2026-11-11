export type TonNetwork = 'mainnet' | 'testnet';

export const TON_NETWORK: TonNetwork =
  import.meta.env.VITE_TON_NETWORK === 'testnet' ? 'testnet' : 'mainnet';

export const IS_TESTNET = TON_NETWORK === 'testnet';

export const TON_CHAIN_ID = IS_TESTNET ? '-3' : '-239';

export const TON_EXPLORER_URL = IS_TESTNET
  ? 'https://testnet.tonviewer.com'
  : 'https://tonviewer.com';
