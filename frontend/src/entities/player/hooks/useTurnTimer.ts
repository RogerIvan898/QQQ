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

  const handleTimeout = React.useEffectEvent(() => onTurnTimeout?.());
  const playBankSound = React.useEffectEvent(() => {
    if (playSound) {
      playTimeBankSound();
    }
  });

  React.useEffect(() => {
    setUsingBank(false);

    if (!isTurn) {
      return;
    }

    let bankTimer: number | undefined;

    const turnTimer = window.setTimeout(() => {
      if (timeBankSec <= 0) {
        handleTimeout();

        return;
      }

      setUsingBank(true);

      playBankSound();

      bankTimer = window.setTimeout(
        () => handleTimeout(),
        timeBankSec * MS_IN_SECOND
      );
    }, turnDurationSec * MS_IN_SECOND);

    return () => {
      window.clearTimeout(turnTimer);
      window.clearTimeout(bankTimer);
    };
  }, [isTurn, turnDurationSec, timeBankSec]);

  return {
    showTimer: isTurn,
    usingBank,
    phaseDurationMs: (usingBank ? timeBankSec : turnDurationSec) * MS_IN_SECOND,
  };
};
