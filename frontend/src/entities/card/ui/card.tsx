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

const MAX_TILT_DEG = 5;

export const Card = ({ card, flat = false, onReveal }: Props) => {
  const [tilt] = React.useState(() =>
    flat ? 0 : (Math.random() * 2 - 1) * MAX_TILT_DEG
  );
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
      style={{ '--tilt': `${tilt.toFixed(2)}deg` } as React.CSSProperties}
      role="img"
    >
      {card ? <CardFace card={card} /> : <div className={styles.cardBack} />}
    </div>
  );
};
