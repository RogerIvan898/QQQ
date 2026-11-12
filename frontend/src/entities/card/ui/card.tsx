import React from 'react';

import { useStoreMap } from 'effector-react';

import { cn } from 'shared/utils/cn';

import { $highlightView, cardKey, type Card as CardType } from '../model';

import { CardFace } from './card-face';
import styles from './card.module.css';

interface Props {
  card: CardType | null;
  flat?: boolean;
  onReveal?: () => void;
}

export const Card = ({ card, flat = false, onReveal }: Props) => {
  const reveal = React.useEffectEvent(() => onReveal?.());

  React.useEffect(() => {
    reveal();
  }, []);

  const highlight = useStoreMap({
    store: $highlightView,
    keys: [card ? cardKey(card) : null],
    fn: ({ keys, dimOthers }, [key]) => {
      if (!keys || !key) {
        return null;
      }

      if (keys.has(key)) {
        return dimOthers ? 'on' : 'live';
      }

      return dimOthers ? 'off' : null;
    },
  });

  return (
    <div
      className={cn(
        styles.card,
        flat ? styles.playFlat : styles.play,
        card && styles.face,
        highlight === 'on' && styles.highlighted,
        highlight === 'live' && styles.live,
        highlight === 'off' && styles.dimmed
      )}
      role="img"
    >
      {card ? <CardFace card={card} /> : <div className={styles.cardBack} />}
    </div>
  );
};
