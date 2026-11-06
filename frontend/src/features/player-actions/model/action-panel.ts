import { createEvent, createStore } from 'effector';

/**
 * Viewport Y of the open raise panel's top edge, or null when it's closed.
 * The table uses it to lift the viewer's seat above the panel on phones.
 */
export const setRaisePanelTop = createEvent<number | null>();

export const $raisePanelTop = createStore<number | null>(null).on(
  setRaisePanelTop,
  (_, top) => top
);
