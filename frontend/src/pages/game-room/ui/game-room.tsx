import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import { useGate, useUnit } from 'effector-react';
import { ArrowLeft, Settings } from 'lucide-react';

import { gameModel } from 'entities/game';
import { PlayerActions } from 'features/player-actions';
import { PokerBoard } from 'widgets/poker-table';
import { SettingsDialog } from 'widgets/settings';

import { GamePageGate } from '../model';

import { GameLoader } from './game-loader';
import styles from './game-room.module.css';

const RevealCardsButton = import.meta.env.DEV
  ? React.lazy(() =>
      import('features/mock-server').then(module => ({
        default: module.RevealCardsButton,
      }))
    )
  : null;

export const GameRoomPage = () => {
  const { t } = useLingui();
  useGate(GamePageGate);

  const navigate = useNavigate();
  const [isLoading, connectionLost] = useUnit([
    gameModel.$isGameLoading,
    gameModel.$connectionLost,
  ]);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

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
