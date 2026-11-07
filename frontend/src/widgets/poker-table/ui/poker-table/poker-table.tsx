import React from 'react';

import { Card } from 'entities/card';
import type { CardType } from 'entities/card';
import { Sound } from 'shared/assets/sounds';
import { useSound } from 'shared/lib/audio';
import { useChipFormatter } from 'shared/lib/display-settings';
import { Logo } from 'shared/ui/logo';

import styles from './poker-table.module.css';

interface Props {
  cards: CardType[];
  pot: number;
  showPot?: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

export const PokerTable = ({
  cards = [],
  pot,
  showPot = pot > 0,
  ref,
}: Props) => {
  const formatChips = useChipFormatter();
  const { play: playDeal } = useSound(Sound.CARD_DEAL);

  return (
    <div className={styles.tableContainer}>
      <div className={styles.pokerTable} ref={ref}>
        <div className={styles.tableRail} />
        <div className={styles.tableSurface}>
          <div className={styles.boardCenter}>
            <div className={styles.mainPotArea} data-pot>
              {showPot && (
                <div className={styles.potBadge}>
                  <Logo size={16} className={styles.potLogo} />
                  <span className={styles.potValue}>{formatChips(pot)}</span>
                </div>
              )}
            </div>
            <div className={styles.communityCards}>
              {cards.map(c => (
                <Card
                  key={`${c.rank}-${c.suit}`}
                  card={c}
                  onReveal={playDeal}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
