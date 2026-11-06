import React from 'react';

import { Card } from 'entities/card';
import { Sound } from 'shared/assets/sounds';
import { useSound } from 'shared/lib/audio';
import { cn } from 'shared/utils/cn';

import { getHandKey } from '../../lib';
import type { Player } from '../../model';

import styles from './player-cards.module.css';

interface Props {
  cards: Player['hand'];
  needSound?: boolean;
  large?: boolean;
}

const SECOND_CARD_DELAY_MS = 450;

export const PlayerCards = ({
  cards,
  needSound = false,
  large = false,
}: Props) => {
  const { play: playCardSound, ready } = useSound(Sound.CARD_REVEAL);

  const [showFirst, setShowFirst] = React.useState(false);
  const [showSecond, setShowSecond] = React.useState(false);

  const cardsKey = getHandKey(cards) ?? '';

  React.useEffect(() => {
    if (!cardsKey) {
      setShowFirst(false);
      setShowSecond(false);

      return;
    }

    if (needSound && !ready) {
      return;
    }

    setShowFirst(false);
    setShowSecond(false);

    const revealFirst = () => setShowFirst(true);
    const revealSecond = () => setShowSecond(true);

    if (needSound) {
      playCardSound({ onStart: revealFirst });
    } else {
      revealFirst();
    }

    const showSecondTimer = window.setTimeout(() => {
      if (needSound) {
        playCardSound({ onStart: revealSecond });
      } else {
        revealSecond();
      }
    }, SECOND_CARD_DELAY_MS);

    return () => {
      window.clearTimeout(showSecondTimer);
    };
  }, [cardsKey, needSound, ready, playCardSound]);

  const faceUp = Boolean(cards && cards.length >= 2);
  const leftCard = faceUp && cards ? cards[0] : null;
  const rightCard = faceUp && cards ? cards[1] : null;

  return (
    <div className={cn(styles.cards, large && styles.large)}>
      <div
        className={cn(
          styles.cardSlot,
          (showFirst || !faceUp) && styles.visible
        )}
      >
        <Card card={leftCard} flat />
      </div>

      <div
        className={cn(
          styles.cardSlot,
          (showSecond || !faceUp) && styles.visible
        )}
      >
        <Card card={rightCard} flat />
      </div>
    </div>
  );
};
