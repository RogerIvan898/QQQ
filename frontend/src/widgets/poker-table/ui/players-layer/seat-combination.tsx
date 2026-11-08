import { useLingui } from '@lingui/react';
import { useUnit } from 'effector-react';

import type { CardType as Card } from 'entities/card';
import { gameModel } from 'entities/game';
import { handCategoryLabel } from 'features/equity';

import styles from './players-layer.module.css';

interface Props {
  hand: readonly Card[] | null;
}

export const SeatCombination = ({ hand }: Props) => {
  const { i18n } = useLingui();
  const community = useUnit(gameModel.$community);
  const label = hand ? handCategoryLabel(hand, community) : null;

  if (!label) {
    return null;
  }

  return <span className={styles.combination}>{i18n._(label)}</span>;
};
