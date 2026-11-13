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
  /** Card backs to deal while the cards are hidden (2 in Hold'em, 4 in Omaha). */
  backCount?: number;
  needSound?: boolean;
  large?: boolean;

  dealDelayMs?: number;

  mucking?: boolean;
}

const FACE_UP_STEP_MS = 450;

const BACKS_STEP_MS = 160;

const FLIP_STEP_MS = 120;

/** Fan angle per card: two cards lean ±4°, four spread over ±9°. */
const fanAngles = (count: number) => {
  if (count < 2) {
    return [0];
  }

  const spread = count <= 2 ? 4 : 9;

  return Array.from(
    { length: count },
    (_, index) => -spread + (index * 2 * spread) / (count - 1)
  );
};

export const PlayerCards = ({
  cards,
  backCount = 2,
  needSound = false,
  large = false,
  dealDelayMs = 0,
  mucking = false,
}: Props) => {
  const { play: playCardSound, ready } = useSound(Sound.CARD_REVEAL);

  // How many slots (from the left) are dealt / turned so far.
  const [shown, setShown] = React.useState(0);

  const cardsKey = getHandKey(cards) ?? '';

  const faceUp = Boolean(cards && cards.length >= 2);
  const count = faceUp && cards ? cards.length : backCount;

  const flip = faceUp && !large;

  const runDeal = React.useEffectEvent(() => {
    setShown(0);

    const timers: number[] = [];
    const later = (callback: () => void, ms: number) =>
      timers.push(window.setTimeout(callback, ms));
    const reveal = (slot: number) => () => setShown(slot + 1);

    for (let slot = 0; slot < count; slot += 1) {
      if (!cardsKey) {
        later(reveal(slot), dealDelayMs + 16 + slot * BACKS_STEP_MS);
      } else if (flip) {
        later(reveal(slot), 16 + slot * FLIP_STEP_MS);
      } else {
        const show = () => {
          if (needSound) {
            playCardSound({ onStart: reveal(slot) });
          } else {
            reveal(slot)();
          }
        };

        if (slot === 0) {
          show();
        } else {
          later(show, slot * FACE_UP_STEP_MS);
        }
      }
    }

    return () => timers.forEach(timer => window.clearTimeout(timer));
  });

  React.useEffect(() => {
    if (needSound && !ready) {
      return;
    }

    return runDeal();
  }, [cardsKey, count, needSound, ready]);

  const angles = fanAngles(count);

  return (
    <div
      className={cn(
        styles.cards,
        count > 2 && styles.wide,
        large && styles.large,
        flip && styles.flip,
        mucking && styles.mucking
      )}
    >
      {angles.map((angle, slot) => (
        <div
          key={slot}
          className={cn(styles.cardSlot, slot < shown && styles.visible)}
          style={
            {
              '--angle': `${angle}deg`,
              '--slot-delay': `${slot * 90}ms`,
            } as React.CSSProperties
          }
        >
          <Card card={faceUp && cards ? (cards[slot] ?? null) : null} flat />
        </div>
      ))}
    </div>
  );
};
