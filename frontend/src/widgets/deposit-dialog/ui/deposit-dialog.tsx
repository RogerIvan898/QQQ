import { useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { ArrowLeft } from 'lucide-react';

import { Dialog, DialogHeaderButton } from 'shared/ui/dialog';

import { DEPOSIT_STEP, DEPOSIT_STEPS } from '../constants';
import type { DepositStep } from '../types';
import { getDepositStepNumber } from '../utils';

import styles from './deposit-dialog.module.css';
import { AmountStep } from './steps/amount-step';
import { PaymentDetailsStep } from './steps/payment-details';

interface Props {
  open: boolean;
  onClose: () => void;
  depositAddress: string;
  memo?: string;
  onCopyText?: (text: string, type: 'address' | 'memo' | 'amount') => void;
  onSuccess?: () => void;
}

export const DepositDialog = ({
  open,
  onClose,
  depositAddress,
  memo,
  onCopyText,
  onSuccess,
}: Props) => {
  const { t } = useLingui();

  const [step, setStep] = useState<DepositStep>(DEPOSIT_STEP.Amount);
  const [amount, setAmount] = useState(0);

  // Сброс при открытии: диалог всегда открывается с первого шага и пустой суммы.
  // Сброс при закрытии тоже работал бы, но давал лишний setState при первом монтировании.
  useEffect(() => {
    if (open) {
      setStep(DEPOSIT_STEP.Amount);
      setAmount(0);
    }
  }, [open]);

  const isAmountStep = step === DEPOSIT_STEP.Amount;
  const isDetailsStep = step === DEPOSIT_STEP.Details;

  const stepTitle = isAmountStep ? t`Deposit TON` : t`Payment details`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="bottom"
      title={stepTitle}
      titleAddon={
        <span className={styles.stepper}>
          {getDepositStepNumber(step)}/{DEPOSIT_STEPS.length}
        </span>
      }
      leading={
        isDetailsStep ? (
          <DialogHeaderButton
            onClick={() => setStep(DEPOSIT_STEP.Amount)}
            ariaLabel={t`Back`}
          >
            <ArrowLeft size={18} />
          </DialogHeaderButton>
        ) : undefined
      }
    >
      {isAmountStep && (
        <AmountStep
          amount={amount}
          onChangeAmount={setAmount}
          onNext={() => setStep(DEPOSIT_STEP.Details)}
        />
      )}

      {isDetailsStep && (
        <PaymentDetailsStep
          amount={amount}
          depositAddress={depositAddress}
          memo={memo}
          onCopyText={onCopyText}
          onSuccess={onSuccess ?? onClose}
        />
      )}
    </Dialog>
  );
};
