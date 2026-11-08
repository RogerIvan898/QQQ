import React from 'react';

import { useUnit } from 'effector-react';

import { gameModel } from 'entities/game';
import { findPlayerById, PlayerStatus } from 'entities/player';
import { sessionModel } from 'entities/session';

import { canPreAct, setRaisePanelRect } from '../model';

import { ActionPanel } from './action-panel';
import { BetManager } from './bet-manager';
import styles from './player-actions.module.css';

export const PlayerActions = () => {
  const [viewerId, allowedActions, players, pot, bigBlind, round] = useUnit([
    sessionModel.$currentUserId,
    gameModel.$myAllowedActions,
    gameModel.$players,
    gameModel.$pot,
    gameModel.$bigBlind,
    gameModel.$round,
  ]);

  const [isChangingAmount, setIsChangingAmount] = React.useState(false);
  const isMyTurn = Boolean(allowedActions);

  React.useEffect(() => {
    if (!isMyTurn) {
      setIsChangingAmount(false);
    }
  }, [isMyTurn]);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const isRaisePanelOpen = isMyTurn && isChangingAmount;

  React.useLayoutEffect(() => {
    const element = containerRef.current;

    if (!isRaisePanelOpen || !element) {
      setRaisePanelRect(null);
      return;
    }

    const update = () => {
      const { top, left, right } = element.getBoundingClientRect();

      setRaisePanelRect({ top, left, right });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      setRaisePanelRect(null);
    };
  }, [isRaisePanelOpen]);

  if (!viewerId) {
    return null;
  }

  const viewer = findPlayerById(players, viewerId);
  const showPreActions = canPreAct(viewer?.status) && !isMyTurn;

  const canBet = !allowedActions?.canCall || allowedActions.minRaise === 0;
  const canPutChips =
    (allowedActions?.maxRaise ?? 0) >= (allowedActions?.minRaise ?? 0);

  return (
    <div ref={containerRef} className={styles.actionContainer}>
      {isRaisePanelOpen ? (
        <BetManager
          minAmount={allowedActions?.minRaise ?? 0}
          maxAmount={allowedActions?.maxRaise ?? 1000}
          bigBlind={bigBlind}
          pot={
            pot +
            Object.values(players).reduce(
              (sum, player) => sum + player.committed,
              0
            )
          }
          callAmount={allowedActions?.callAmount ?? 0}
          committed={viewer?.committed ?? 0}
          preflop={round === 'PREFLOP'}
          onCancel={() => setIsChangingAmount(false)}
          variant={canBet ? 'bet' : 'raise'}
        />
      ) : (
        <ActionPanel
          isMyTurn={isMyTurn}
          showPreActions={showPreActions}
          hasFolded={viewer?.status === PlayerStatus.FOLDED}
          sittingOut={viewer?.status === PlayerStatus.SITTING_OUT}
          returning={Boolean(viewer?.returning)}
          canFold={allowedActions?.canFold ?? true}
          canCall={allowedActions?.canCall ?? true}
          canRaise={canPutChips}
          onRaiseClick={() => setIsChangingAmount(true)}
          isBet={canBet}
          callAmount={allowedActions?.callAmount ?? 0}
        />
      )}
    </div>
  );
};
