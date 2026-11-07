import { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { ChevronRight } from 'lucide-react';

import { Logo } from 'shared/ui/logo';
import { NumberField } from 'shared/ui/number-field';
import { parseNumericInput } from 'shared/utils/format';
import { toDepositInputValue } from 'widgets/deposit-dialog/utils';

import styles from '../../deposit-dialog.module.css';

import { QUICK_ADD_OPTIONS } from './constants';
import { QuickAddOptions } from './quick-add-options';
import { parseInput } from './utils';

interface Props {
  amount: number;
  onChangeAmount: (value: number) => void;
  onNext: () => void;
}

export const AmountStep = ({ amount, onChangeAmount, onNext }: Props) => {
  const { t } = useLingui();

  const [draft, setDraft] = useState(() => toDepositInputValue(amount));
  const [prevAmount, setPrevAmount] = useState(amount);

  if (prevAmount !== amount) {
    setPrevAmount(amount);

    if (parseNumericInput(draft) !== amount) {
      setDraft(toDepositInputValue(amount));
    }
  }

  const isValid = Number.isFinite(amount) && amount > 0;

  const handleInputChange = (value: string) => {
    setDraft(value);
    onChangeAmount(parseInput(value));
  };

  const handleQuickAdd = (value: number) => {
    onChangeAmount(amount + value);
  };

  return (
    <div className={styles.content}>
      <label className={styles.label} htmlFor="deposit-amount">
        {t`Amount`}
      </label>

      <div className={styles.amountBox}>
        <NumberField
          id="deposit-amount"
          value={draft}
          onChange={handleInputChange}
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={!isValid && draft !== ''}
        />
        <span className={styles.amountCurrency}>
          <Logo /> TON
        </span>
      </div>

      <p className={styles.hint}>{t`Enter the amount you want to deposit`}</p>

      <QuickAddOptions options={QUICK_ADD_OPTIONS} onAdd={handleQuickAdd} />

      <button
        type="button"
        className={styles.primaryBtn}
        disabled={!isValid}
        onClick={onNext}
      >
        <span>{isValid ? t`Continue` : t`Enter amount to continue`}</span>
        <ChevronRight size={18} />
      </button>
    </div>
  );
};
