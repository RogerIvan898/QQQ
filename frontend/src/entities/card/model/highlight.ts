import { createEvent, createStore } from 'effector';

import type { Card } from './types';

export const cardKey = (card: Card) => `${card.rank}${card.suit}`;

export const highlightShown = createEvent<{ owner: number; cards: Card[] }>();
export const highlightHidden = createEvent<number>();

export const $highlights = createStore<Record<number, string[]>>({})
  .on(highlightShown, (state, { owner, cards }) => ({
    ...state,
    [owner]: cards.map(cardKey),
  }))
  .on(highlightHidden, (state, owner) => {
    if (!(owner in state)) {
      return state;
    }

    const next = { ...state };

    delete next[owner];

    return next;
  });

export const $highlightedKeys = $highlights.map(state => {
  const keys = Object.values(state).flat();

  return keys.length > 0 ? new Set(keys) : null;
});
