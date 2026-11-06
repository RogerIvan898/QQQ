import { useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import { useUnit } from 'effector-react';
import { Loader2, Users } from 'lucide-react';

import { cn } from 'shared/utils/cn';

import { $joiningRoomId, joinRoomFx } from '../model';

import styles from './join-room-button.module.css';

interface Props {
  roomId: string;
  isFull: boolean;
}

export const JoinRoomButton = ({ roomId, isFull }: Props) => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [join, joiningRoomId] = useUnit([joinRoomFx, $joiningRoomId]);

  const isJoiningRoom = joiningRoomId === roomId;
  const isJoiningAny = Boolean(joiningRoomId);
  const isDisabled = isFull || isJoiningAny;
  const [showJoining, setShowJoining] = useState(false);

  useEffect(() => {
    if (!isJoiningRoom) {
      setShowJoining(false);
      return;
    }

    const timer = window.setTimeout(() => setShowJoining(true), 300);

    return () => window.clearTimeout(timer);
  }, [isJoiningRoom]);

  const handleJoin = async () => {
    if (isDisabled) {
      return;
    }

    try {
      const { roomId: joinedRoomId, wsUrl } = await join(roomId);

      void navigate({
        to: '/game/$roomId',
        params: { roomId: joinedRoomId },
        state: { wsUrl },
      });
    } catch (error) {
      console.error('Failed to join room', error);
    }
  };

  return (
    <button
      type="button"
      className={cn(styles.button, (isFull || showJoining) && styles.disabled)}
      disabled={isDisabled}
      onClick={() => void handleJoin()}
    >
      {isFull ? (
        <>
          <Users size={16} />
          {t`Table full`}
        </>
      ) : showJoining ? (
        <>
          <Loader2 size={16} className={styles.spin} />
          {t`Joining…`}
        </>
      ) : (
        t`Play`
      )}
    </button>
  );
};
