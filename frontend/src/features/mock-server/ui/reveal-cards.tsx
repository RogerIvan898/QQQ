import { useState } from 'react';

import { useUnit } from 'effector-react';

import { CLIENT_COMMANDS, gameModel } from 'entities/game';
import { cn } from 'shared/utils/cn';

import { $mockServerEnabled } from '../model';

import styles from './mock-server.module.css';

export const RevealCardsButton = () => {
  const [mockEnabled, sendCommand] = useUnit([
    $mockServerEnabled,
    gameModel.sendClientCommand,
  ]);
  const [visible, setVisible] = useState(false);

  if (!mockEnabled) {
    return null;
  }

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    sendCommand({
      type: CLIENT_COMMANDS.REVEAL_HOLES,
      payload: { visible: next },
    });
  };

  return (
    <button
      type="button"
      className={cn(styles.revealBtn, visible && styles.revealBtnActive)}
      onClick={toggle}
    >
      {visible ? 'Hide cards' : 'Show cards'}
    </button>
  );
};
