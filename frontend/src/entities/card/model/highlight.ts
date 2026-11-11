import { createEvent, createStore } from 'effector';

import type { Card } from './types';

export const cardKey = (card: Card) => `${card.rank}${card.suit}`;

export type HighlightMode = 'win' | 'live';

interface HighlightEntry {
  mode: HighlightMode;
  keys: string[];
}

export const highlightShown = createEvent<{
  owner: string;
  cards: Card[];
  mode: HighlightMode;
}>();
export const highlightHidden = createEvent<string>();

export const $highlights = createStore<Record<string, HighlightEntry>>({})
  .on(highlightShown, (state, { owner, cards, mode }) => {
    const keys = cards.map(cardKey);
    const prev = state[owner];

    if (prev?.mode === mode && prev.keys.join() === keys.join()) {
      return state;
    }

    return { ...state, [owner]: { mode, keys } };
  })
  .on(highlightHidden, (state, owner) => {
    if (!(owner in state)) {
      return state;
    }

    const next = { ...state };

    delete next[owner];

    return next;
  });

const keysOf = (state: Record<string, HighlightEntry>, mode: HighlightMode) => {
  const keys = Object.values(state)
    .filter(entry => entry.mode === mode)
    .flatMap(entry => entry.keys);

  return keys.length > 0 ? new Set(keys) : null;
};

export const $highlightView = $highlights.map(state => {
  const win = keysOf(state, 'win');

  return win
    ? { keys: win, dimOthers: true }
    : { keys: keysOf(state, 'live'), dimOthers: false };
});
