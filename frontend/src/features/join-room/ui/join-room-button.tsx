import { useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Loader2, Play, Users } from 'lucide-react';

import { cn } from 'shared/utils/cn';

import styles from './join-room-button.module.css';
import { useJoinRoom } from './use-join-room';

interface Props {
  roomId: string;
  isFull: boolean;

  onBlocked?: () => void;
}

export const JoinRoomButton = ({ roomId, isFull, onBlocked }: Props) => {
  const { t } = useLingui();
  const { joinRoom, joiningRoomId } = useJoinRoom();

  const isJoiningRoom = joiningRoomId === roomId;
  const isDisabled = isFull || Boolean(joiningRoomId);
  const [showJoining, setShowJoining] = useState(false);

  useEffect(() => {
    if (!isJoiningRoom) {
      setShowJoining(false);
      return;
    }

    const timer = window.setTimeout(() => setShowJoining(true), 300);

    return () => window.clearTimeout(timer);
  }, [isJoiningRoom]);

  const handleClick = () => {
    if (isDisabled) {
      return;
    }

    if (onBlocked) {
      onBlocked();
      return;
    }

    void joinRoom(roomId);
  };

  return (
    <button
      type="button"
      className={cn(styles.button, (isFull || showJoining) && styles.disabled)}
      disabled={isDisabled}
      onClick={handleClick}
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
        <>
          <Play size={14} strokeWidth={2.75} className={styles.playIcon} />
          {t`Play`}
        </>
      )}
    </button>
  );
};
