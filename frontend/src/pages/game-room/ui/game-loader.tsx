import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { Preloader } from 'shared/ui/preloader';

const PHRASE_INTERVAL_MS = 2500;

const pickOther = (count: number, current: number) => {
  if (count < 2) return 0;

  const next = Math.floor(Math.random() * (count - 1));

  return next >= current ? next + 1 : next;
};

export const GameLoader = () => {
  const { t } = useLingui();

  const phrases = [
    t`The jack is late to the deal again...`,
    t`Making room for new players...`,
    t`Setting up the table...`,
    t`Aces are taking their seats...`,
    t`The king is looking for his queen...`,
    t`Players are taking their positions...`,
    t`The dealer is counting the cards...`,
    t`Checking player positions...`,
    t`Checking that the dealer is ready...`,
    t`Checking game server availability...`,
  ];

  const [index, setIndex] = React.useState(() =>
    Math.floor(Math.random() * phrases.length)
  );

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex(current => pickOther(phrases.length, current));
    }, PHRASE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [phrases.length]);

  return <Preloader label={phrases[index]} />;
};
