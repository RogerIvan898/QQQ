import { cn } from 'shared/utils/cn';

import { getSuitSymbol } from '../lib';
import type { Card } from '../model';

import styles from './mini-card.module.css';

interface Props {
  /** `null` draws a face-down card. */
  card: Card | null;
  size?: 'sm' | 'md';
}

/** Small static card for lists and logs (no flip, no animation). */
export const MiniCard = ({ card, size = 'sm' }: Props) => {
  const isRed = card?.suit === 'hearts' || card?.suit === 'diamonds';

  return (
    <span
      className={cn(
        styles.card,
        styles[size],
        !card && styles.back,
        isRed && styles.red
      )}
    >
      {card ? (
        <>
          {card.rank}
          {getSuitSymbol(card.suit)}
        </>
      ) : null}
    </span>
  );
};
