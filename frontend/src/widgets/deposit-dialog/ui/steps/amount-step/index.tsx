import { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { ChevronRight } from 'lucide-react';

import { walletModel } from 'entities/wallet';
import { Logo } from 'shared/ui/logo';
import { NumberField } from 'shared/ui/number-field';
import { formatBalance, parseNumericInput } from 'shared/utils/format';
import { toDepositInputValue } from 'widgets/deposit-dialog/utils';

import shared from '../../deposit-dialog.module.css';

import styles from './amount-step.module.css';
import { QUICK_ADD_OPTIONS } from './constants';
import { QuickAddOptions } from './quick-add-options';
import { parseInput } from './utils';

interface Props {
  amount: number;
  onChangeAmount: (value: number) => void;
  onNext: () => void;
}

export const AmountStep = ({ amount, onChangeAmount, onNext }: Props) => {
  const { t, i18n } = useLingui();
  const balance = useUnit(walletModel.$balance);

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

  const after =
    balance === null ? null : formatBalance(balance + amount, i18n.locale);
  const current = balance === null ? null : formatBalance(balance, i18n.locale);

  return (
    <div className={styles.step}>
      <label className={styles.amountBox} htmlFor="deposit-amount">
        <span className={styles.caption}>{t`You deposit`}</span>
        <span className={styles.amountRow}>
          <NumberField
            id="deposit-amount"
            className={styles.input}
            value={draft}
            onChange={handleInputChange}
            placeholder="0"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={!isValid && draft !== ''}
            style={{ width: `${Math.max(1, draft.length || 1) + 0.5}ch` }}
          />
          <span className={styles.currency}>
            <Logo size={20} />
            TON
          </span>
        </span>
      </label>

      {current !== null ? (
        <p className={styles.balance}>
          {t`Balance`} <b>{current} TON</b>
          {isValid ? (
            <>
              <ChevronRight size={14} className={styles.arrow} />
              <b className={styles.after}>{after} TON</b>
            </>
          ) : null}
        </p>
      ) : null}

      <QuickAddOptions options={QUICK_ADD_OPTIONS} onAdd={handleQuickAdd} />

      <button
        type="button"
        className={shared.primaryBtn}
        disabled={!isValid}
        onClick={onNext}
      >
        <span>{isValid ? t`Continue` : t`Enter amount to continue`}</span>
        <ChevronRight size={18} />
      </button>
    </div>
  );
};
