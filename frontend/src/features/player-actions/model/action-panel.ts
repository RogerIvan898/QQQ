import { createEvent, createStore } from 'effector';

export interface RaisePanelRect {
  top: number;
  left: number;
  right: number;
}

/**
 * Viewport box of the open raise panel, or null when it's closed. The table
 * lifts the viewer's seat above it, but only when the panel actually covers
 * the seat (phones), not when it sits off to the side (desktop).
 */
export const setRaisePanelRect = createEvent<RaisePanelRect | null>();

export const $raisePanelRect = createStore<RaisePanelRect | null>(null).on(
  setRaisePanelRect,
  (_, rect) => rect
);
