import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useGate, useUnit } from 'effector-react';
import { ArrowLeft, History, Play, Settings, X } from 'lucide-react';

import { gameModel } from 'entities/game';
import { $rooms, findRoom, roomsRequested } from 'entities/room';
import {
  HAND_HISTORY_TOGGLE_ATTR,
  HandHistorySheet,
  type HandRecord,
} from 'features/hand-history';
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
  const [rooms, requestRooms] = useUnit([$rooms, roomsRequested]);
  const room = findRoom(rooms, roomId);

  React.useEffect(() => {
    if (rooms.length === 0) {
      requestRooms();
    }
  }, [rooms.length, requestRooms]);
  useGate(GamePageGate, { roomId });

  const navigate = useNavigate();
  const [isLoading, connectionLost] = useUnit([
    gameModel.$isGameLoading,
    gameModel.$connectionLost,
  ]);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [replayHand, setReplayHand] = React.useState<HandRecord | null>(null);

  const isMyTurn = useUnit(gameModel.$myAllowedActions) !== null;
  const [replayMinimized, setReplayMinimized] = React.useState(false);

  if (isMyTurn && replayHand && !replayMinimized) {
    setReplayMinimized(true);
  }

  const replayShown = Boolean(replayHand) && !replayMinimized;
  const openReplay = (hand: HandRecord) => {
    setReplayMinimized(false);
    setReplayHand(hand);
  };
  const closeReplay = () => {
    setReplayMinimized(false);
    setReplayHand(null);
  };
  useTelegramBackButton(() => void navigate({ to: '/' }));

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

      {room && (
        <p className={styles.tableInfo}>
          {room.name} · {room.blinds} TON
        </p>
      )}

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
        onClick={() => setIsHistoryOpen(open => !open)}
        aria-expanded={isHistoryOpen}
        {...{ [HAND_HISTORY_TOGGLE_ATTR]: '' }}
        aria-label={t`Hand history`}
        title={t`Hand history`}
      >
        <History size={18} />
      </button>

      <HandHistorySheet
        open={isHistoryOpen && !replayHand}
        onClose={() => setIsHistoryOpen(false)}
        onSelect={openReplay}
      />

      {replayHand ? (
        <HandReplay
          key={replayHand.id}
          hand={replayHand}
          onClose={closeReplay}
          suspended={!replayShown}
        />
      ) : null}

      {replayHand && replayMinimized && !isMyTurn ? (
        <div className={styles.resumeReplay} role="status">
          <button
            type="button"
            className={styles.resumeReplayBtn}
            onClick={() => setReplayMinimized(false)}
          >
            <Play size={14} strokeWidth={2.5} />
            {t`Resume replay`}
          </button>
          <button
            type="button"
            className={styles.resumeReplayClose}
            onClick={closeReplay}
            aria-label={t`Close replay`}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
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
      <React.Activity mode={replayShown ? 'hidden' : 'visible'}>
        <PokerBoard />
        <PlayerActions />
      </React.Activity>
    </div>
  );
};
