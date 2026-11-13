import { useLingui } from '@lingui/react';
import { useStoreMap, useUnit } from 'effector-react';

import type { CardType as Card } from 'entities/card';
import { gameModel } from 'entities/game';
import { handCategoryLabel } from 'features/equity';

import { NO_CARDS } from './constants';
import styles from './players-layer.module.css';

interface Props {
  hand: readonly Card[] | null;
}

export const SeatCombination = ({ hand }: Props) => {
  const { i18n } = useLingui();
  // Seats without visible cards (most of them, most of the time) don't need
  // the board, so they don't re-render on every dealt card.
  const community = useStoreMap({
    store: gameModel.$community,
    keys: [hand !== null],
    fn: (cards, [shown]) => (shown ? cards : NO_CARDS),
  });
  const variant = useUnit(gameModel.$gameVariant);
  const label = hand ? handCategoryLabel(hand, community, variant) : null;

  if (!label) {
    return null;
  }

  return <span className={styles.combination}>{i18n._(label)}</span>;
};
