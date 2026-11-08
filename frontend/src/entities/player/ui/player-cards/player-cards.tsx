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
  /** Wait before the first card arrives (deal order round the table). */
  dealDelayMs?: number;
  /** Folded: the cards slide toward the centre and fade (the muck). */
  mucking?: boolean;
}

const SECOND_CARD_DELAY_MS = 450;
/** Face-down cards for opponents: the second follows quickly. */
const BACKS_SECOND_DELAY_MS = 160;
/** Showdown: the two cards turn over one right after the other. */
const FLIP_SECOND_DELAY_MS = 120;

export const PlayerCards = ({
  cards,
  needSound = false,
  large = false,
  dealDelayMs = 0,
  mucking = false,
}: Props) => {
  const { play: playCardSound, ready } = useSound(Sound.CARD_REVEAL);

  const [showFirst, setShowFirst] = React.useState(false);
  const [showSecond, setShowSecond] = React.useState(false);

  const cardsKey = getHandKey(cards) ?? '';

  const faceUp = Boolean(cards && cards.length >= 2);
  // An opponent's cards turning face up (showdown, reveal) flip over in place
  // instead of being dealt again.
  const flip = faceUp && !large;

  // Reads the latest props without re-running: the deal runs once per mount
  // (the parent re-keys the cards every hand) and when sound becomes ready.
  const runDeal = React.useEffectEvent(() => {
    setShowFirst(false);
    setShowSecond(false);

    const revealFirst = () => setShowFirst(true);
    const revealSecond = () => setShowSecond(true);
    const timers: number[] = [];
    const later = (callback: () => void, ms: number) =>
      timers.push(window.setTimeout(callback, ms));

    if (!cardsKey) {
      // Face-down cards: dealt from the centre in seat order.
      later(revealFirst, dealDelayMs + 16);
      later(revealSecond, dealDelayMs + BACKS_SECOND_DELAY_MS);
    } else if (flip) {
      later(revealFirst, 16);
      later(revealSecond, FLIP_SECOND_DELAY_MS);
    } else {
      if (needSound) {
        playCardSound({ onStart: revealFirst });
      } else {
        revealFirst();
      }

      later(() => {
        if (needSound) {
          playCardSound({ onStart: revealSecond });
        } else {
          revealSecond();
        }
      }, SECOND_CARD_DELAY_MS);
    }

    return () => timers.forEach(timer => window.clearTimeout(timer));
  });

  React.useEffect(() => {
    if (needSound && !ready) {
      return;
    }

    return runDeal();
  }, [cardsKey, needSound, ready]);

  const leftCard = faceUp && cards ? cards[0] : null;
  const rightCard = faceUp && cards ? cards[1] : null;

  return (
    <div
      className={cn(
        styles.cards,
        large && styles.large,
        flip && styles.flip,
        mucking && styles.mucking
      )}
    >
      <div className={cn(styles.cardSlot, showFirst && styles.visible)}>
        <Card card={leftCard} flat />
      </div>

      <div className={cn(styles.cardSlot, showSecond && styles.visible)}>
        <Card card={rightCard} flat />
      </div>
    </div>
  );
};
