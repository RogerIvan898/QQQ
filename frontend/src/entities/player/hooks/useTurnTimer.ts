import React from 'react';

import { Sound } from 'shared/assets/sounds';
import { useSound } from 'shared/lib/audio';

const MS_IN_SECOND = 1000;

export const useTurnTimer = ({
  isTurn,
  turnDurationSec,
  timeBankSec,
  onTurnTimeout,
  playSound = false,
}: {
  isTurn: boolean;
  turnDurationSec: number;
  timeBankSec: number;
  onTurnTimeout?: () => void;
  playSound?: boolean;
}) => {
  const { play: playTimeBankSound } = useSound(Sound.TIME_BANK);
  const [usingBank, setUsingBank] = React.useState(false);

  const onTurnTimeoutRef = React.useRef(onTurnTimeout);
  const playSoundRef = React.useRef(playSound);

  React.useEffect(() => {
    onTurnTimeoutRef.current = onTurnTimeout;
    playSoundRef.current = playSound;
  }, [onTurnTimeout, playSound]);

  React.useEffect(() => {
    setUsingBank(false);

    if (!isTurn) {
      return;
    }

    let bankTimer: number | undefined;

    const turnTimer = window.setTimeout(() => {
      if (timeBankSec <= 0) {
        onTurnTimeoutRef.current?.();
        return;
      }

      setUsingBank(true);

      if (playSoundRef.current) {
        playTimeBankSound();
      }

      bankTimer = window.setTimeout(
        () => onTurnTimeoutRef.current?.(),
        timeBankSec * MS_IN_SECOND
      );
    }, turnDurationSec * MS_IN_SECOND);

    return () => {
      window.clearTimeout(turnTimer);
      window.clearTimeout(bankTimer);
    };
  }, [isTurn, turnDurationSec, timeBankSec, playTimeBankSound]);

  return {
    showTimer: isTurn,
    usingBank,
    phaseDurationMs: (usingBank ? timeBankSec : turnDurationSec) * MS_IN_SECOND,
  };
};
