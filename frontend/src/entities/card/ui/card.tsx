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
  const ref = React.useRef<HTMLDivElement | null>(null);
  const onRevealRef = React.useRef(onReveal);

  React.useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  React.useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    element.classList.add(flat ? styles.playFlat : styles.play);
    onRevealRef.current?.();

    const onEnd = () => {
      element.style.transform = flat
        ? 'none'
        : `rotate(${(Math.random() * 10 - 5).toFixed(2)}deg)`;
      element.classList.add(styles.settled);
      element.removeEventListener('animationend', onEnd);
    };

    element.addEventListener('animationend', onEnd);

    return () => {
      element.removeEventListener('animationend', onEnd);
    };
  }, [flat]);

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
      ref={ref}
      className={cn(
        styles.card,
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
