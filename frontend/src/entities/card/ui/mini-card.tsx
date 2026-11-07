import { cn } from 'shared/utils/cn';

import type { Card } from '../model';

import { CardFace } from './card-face';
import styles from './mini-card.module.css';

interface Props {
  /** `null` draws a face-down card. */
  card: Card | null;
  size?: 'sm' | 'md';
}

/** Small static card for lists and logs (no flip, no animation). */
export const MiniCard = ({ card, size = 'sm' }: Props) => {
  return (
    <span className={cn(styles.card, styles[size], !card && styles.back)}>
      {card ? <CardFace card={card} /> : null}
    </span>
  );
};
