import React, { useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { Minus, Plus } from 'lucide-react';

import { $amountsInBb } from 'shared/lib/display-settings';
import { Button } from 'shared/ui/button';
import { GramBadge } from 'shared/ui/gram';
import { cn } from 'shared/utils/cn';
import { parseNumericInput } from 'shared/utils/format';
import { clamp } from 'shared/utils/math';

import { potRaiseTo, raise, type BetPreset } from '../../model';

import styles from './bet-manager.module.css';

const CHIP_PRECISION = 100;
const roundChips = (value: number) =>
  Math.round(value * CHIP_PRECISION) / CHIP_PRECISION;

interface Props {
  minAmount: number;
  maxAmount: number;
  bigBlind: number;
  pot: number;
  callAmount: number;
  committed: number;
  preflop: boolean;
  onCancel: () => void;
  variant: 'bet' | 'raise';
}

export const BetManager = ({
  minAmount,
  maxAmount,
  bigBlind,
  pot,
  callAmount,
  committed,
  preflop,
  onCancel,
  variant,
}: Props) => {
  const { t } = useLingui();
  const [amount, setAmount] = useState(minAmount);
  const [draft, setDraft] = useState<string | null>(null);

  const step = bigBlind > 0 ? bigBlind : 1;

  const inBb = useUnit($amountsInBb) && bigBlind > 0;
  const toField = (chips: number) =>
    inBb ? Math.round((chips / bigBlind) * 10) / 10 : chips;
  const fromField = (value: number) => (inBb ? value * bigBlind : value);
  const parsedDraft = draft === null ? null : parseNumericInput(draft);
  const draftValue = parsedDraft === null ? null : fromField(parsedDraft);
  const legal = (value: number) =>
    clamp(roundChips(value), minAmount, maxAmount);

  const commit = (value: number) => {
    setAmount(legal(value));
    setDraft(null);
  };

  useEffect(() => {
    setAmount(current => clamp(roundChips(current), minAmount, maxAmount));
  }, [minAmount, maxAmount]);

  const handleConfirm = () => {
    raise({
      amount: legal(draftValue ?? amount),
    });
    onCancel();
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setDraft(next);
    const parsed = parseNumericInput(next);

    if (parsed === null) {
      return;
    }

    const value = fromField(parsed);

    if (value > maxAmount) {
      commit(maxAmount);
      return;
    }

    if (value >= minAmount) {
      setAmount(roundChips(value));
    }
  };

  const range = maxAmount - minAmount;
  const fillPercent = range > 0 ? ((amount - minAmount) / range) * 100 : 100;

  const setFromTouch = (event: React.TouchEvent<HTMLInputElement>) => {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = clamp((touch.clientX - rect.left) / rect.width, 0, 1);

    commit(minAmount + ratio * range);
  };

  const handleBlur = () => {
    commit(draftValue ?? amount);
  };

  const maxLabel = t`All in`;
  const potLabel = t`Pot`;
  const allInLabel = t`All in`;
  const betLabel = t`Bet`;
  const raiseLabel = t`Raise`;
  const cancelLabel = t`Cancel`;

  const currentBet = committed + callAmount;
  const facingRaise = currentBet > bigBlind;
  const presets: BetPreset[] = preflop
    ? [
        facingRaise
          ? { label: '2.5x', value: currentBet * 2.5 }
          : { label: '2.2 BB', value: bigBlind * 2.2 },
        facingRaise
          ? { label: '3x', value: currentBet * 3 }
          : { label: '3 BB', value: bigBlind * 3 },
        { label: maxLabel, value: maxAmount },
      ]
    : [
        {
          label: '1/2 Pot',
          value: potRaiseTo(0.5, pot, callAmount, committed),
        },
        {
          label: '3/4 Pot',
          value: potRaiseTo(0.75, pot, callAmount, committed),
        },
        { label: potLabel, value: potRaiseTo(1, pot, callAmount, committed) },
        { label: maxLabel, value: maxAmount },
      ];

  const isAllIn = amount >= maxAmount;
  const belowMin = draftValue !== null && draftValue < minAmount;

  return (
    <div className={styles.wrapper}>
      <div className={styles.shortcuts}>
        {presets.map(preset => {
          const value = legal(preset.value);

          return (
            <button
              key={preset.label}
              type="button"
              className={cn(
                styles.shortcut,
                preset.label === maxLabel && styles.shortcutAllIn
              )}
              disabled={
                preset.value < minAmount ||
                (preset.label === maxLabel && amount >= maxAmount)
              }
              onClick={() => commit(value)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className={styles.inputRow}>
        <button
          type="button"
          className={styles.step}
          aria-label="-1 BB"
          disabled={amount <= minAmount}
          onClick={() => commit(amount - step)}
        >
          <Minus size={18} strokeWidth={2.5} />
        </button>
        <div className={styles.inputContainer}>
          <input
            type="number"
            inputMode="numeric"
            value={draft ?? toField(amount)}
            onChange={handleInputChange}
            onBlur={handleBlur}
            min={toField(minAmount)}
            max={toField(maxAmount)}
            step={inBb ? 0.1 : step}
            className={cn(styles.input, belowMin && styles.inputInvalid)}
          />
          <div className={styles.logo}>
            {inBb ? (
              <span className={styles.unit}>BB</span>
            ) : (
              <GramBadge size={20} className={styles.logoIcon} />
            )}
          </div>
        </div>
        <button
          type="button"
          className={styles.step}
          aria-label="+1 BB"
          disabled={amount >= maxAmount}
          onClick={() => commit(amount + step)}
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </div>

      <input
        type="range"
        value={amount}
        onChange={event => commit(Number(event.target.value))}
        onTouchStart={setFromTouch}
        onTouchMove={setFromTouch}
        style={{ '--fill': fillPercent / 100 } as React.CSSProperties}
        min={minAmount}
        max={maxAmount}
        step={1 / CHIP_PRECISION}
        className={styles.slider}
      />

      <div className={styles.buttonRow}>
        <Button
          color={isAllIn ? 'warning' : 'primary'}
          text={
            isAllIn ? allInLabel : variant === 'bet' ? betLabel : raiseLabel
          }
          onClick={handleConfirm}
        />
        <Button color="danger" text={cancelLabel} onClick={onCancel} />
      </div>
    </div>
  );
};
