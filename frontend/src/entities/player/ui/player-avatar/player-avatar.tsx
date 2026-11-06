import { cn } from 'shared/utils/cn';
import { getInitialLetter } from 'shared/utils/format';

import styles from './player-avatar.module.css';

interface Props {
  name: string;
  folded: boolean;
  currentPlayer: boolean;
}

export const PlayerAvatar = ({ name, folded, currentPlayer }: Props) => (
  <div
    className={cn(
      styles.avatar,
      folded && styles.foldedAvatar,
      currentPlayer && styles.currentPlayer
    )}
  >
    {getInitialLetter(name, '?')}
  </div>
);
