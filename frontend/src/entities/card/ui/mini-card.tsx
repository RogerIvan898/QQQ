import { cn } from 'shared/utils/cn';

import type { Card } from '../model';

import { CardFace } from './card-face';
import styles from './mini-card.module.css';

interface Props {
  card: Card | null;
  size?: 'sm' | 'md';
}

export const MiniCard = ({ card, size = 'sm' }: Props) => {
  return (
    <span className={cn(styles.card, styles[size], !card && styles.back)}>
      {card ? <CardFace card={card} /> : null}
    </span>
  );
};
