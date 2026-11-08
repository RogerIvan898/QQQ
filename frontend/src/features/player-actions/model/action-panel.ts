import { createEvent, createStore } from 'effector';

export interface RaisePanelRect {
  top: number;
  left: number;
  right: number;
}

export const setRaisePanelRect = createEvent<RaisePanelRect | null>();

export const $raisePanelRect = createStore<RaisePanelRect | null>(null).on(
  setRaisePanelRect,
  (_, rect) => rect
);
