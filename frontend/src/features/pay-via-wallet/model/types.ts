import type { WalletPaymentRequest } from '../utils/pay-via-wallet';

export interface PaymentOptions extends WalletPaymentRequest {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}
