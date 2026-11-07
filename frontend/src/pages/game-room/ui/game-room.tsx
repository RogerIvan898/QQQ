import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useGate, useUnit } from 'effector-react';
import { ArrowLeft, History, Settings } from 'lucide-react';

import { gameModel } from 'entities/game';
import { HandHistorySheet, type HandRecord } from 'features/hand-history';
import { PlayerActions } from 'features/player-actions';
import {
  useTelegramBackButton,
  useTelegramClosingConfirmation,
} from 'shared/lib/telegram';
import { PokerBoard } from 'widgets/poker-table';
import { SettingsDialog } from 'widgets/settings';

import { GamePageGate } from '../model';

import { GameLoader } from './game-loader';
import styles from './game-room.module.css';
import { HandReplay } from './hand-replay';

const RevealCardsButton = import.meta.env.DEV
  ? React.lazy(() =>
      import('features/mock-server').then(module => ({
        default: module.RevealCardsButton,
      }))
    )
  : null;

export const GameRoomPage = () => {
  const { t } = useLingui();
  const { roomId } = useParams({ from: '/game/$roomId' });
  useGate(GamePageGate, { roomId });

  const navigate = useNavigate();
  const [isLoading, connectionLost] = useUnit([
    gameModel.$isGameLoading,
    gameModel.$connectionLost,
  ]);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [replayHand, setReplayHand] = React.useState<HandRecord | null>(null);
  useTelegramBackButton(() => void navigate({ to: '/' }));
  // A stray swipe-down would otherwise drop the player out of a hand.
  useTelegramClosingConfirmation();

  if (isLoading) {
    return <GameLoader />;
  }

  return (
    <div className={styles.container}>
      {connectionLost && (
        <div className={styles.connectionBanner} role="status">
          {t`Connection lost, reconnecting…`}
        </div>
      )}

      <button
        type="button"
        dir="auto"
        className={styles.backBtn}
        onClick={() => void navigate({ to: '/' })}
      >
        <ArrowLeft size={14} strokeWidth={2.25} />
        {t`Tables`}
      </button>

      <button
        type="button"
        className={styles.settingsBtn}
        onClick={() => setIsSettingsOpen(true)}
        aria-label={t`Settings`}
        title={t`Settings`}
      >
        <Settings size={18} />
      </button>

      <button
        type="button"
        className={styles.historyBtn}
        onClick={() => setIsHistoryOpen(true)}
        aria-label={t`Hand history`}
        title={t`Hand history`}
      >
        <History size={18} />
      </button>

      <HandHistorySheet
        open={isHistoryOpen && !replayHand}
        onClose={() => setIsHistoryOpen(false)}
        onSelect={setReplayHand}
      />

      {replayHand ? (
        <HandReplay
          key={replayHand.id}
          hand={replayHand}
          onClose={() => setReplayHand(null)}
        />
      ) : null}

      <SettingsDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {RevealCardsButton ? (
        <React.Suspense fallback={null}>
          <RevealCardsButton />
        </React.Suspense>
      ) : null}
      <PokerBoard />
      <PlayerActions />
    </div>
  );
};
