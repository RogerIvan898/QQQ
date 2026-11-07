import React from 'react';

import { useStoreMap, useUnit } from 'effector-react';

import { gameModel } from 'entities/game';

import { PlayersLayer } from './players-layer';
import styles from './poker-board.module.css';
import { PokerTable } from './poker-table';

export const PokerBoard = () => {
  const [community, pot] = useUnit([gameModel.$community, gameModel.$pot]);
  const seatCount = useStoreMap(
    gameModel.$players,
    players => Object.keys(players).length
  );

  const [tableElement, setTableElement] = React.useState<HTMLDivElement | null>(
    null
  );
  const [hidePot, setHidePot] = React.useState(false);
  const showPot = !hidePot && pot > 0;

  return (
    <div className={styles.board}>
      <PokerTable
        cards={community}
        pot={pot}
        showPot={showPot}
        // 7+ seats, or 4 / 8 where two seats sit level with the board's row.
        crowded={seatCount >= 7 || seatCount % 4 === 0}
        ref={setTableElement}
      />

      {tableElement && (
        <PlayersLayer tableElement={tableElement} onHidePot={setHidePot} />
      )}
    </div>
  );
};
