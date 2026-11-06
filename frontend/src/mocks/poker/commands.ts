import { CLIENT_COMMANDS } from 'entities/game/model/constants';
import { PlayerAction } from 'entities/player';
import type { PlayerActionType } from 'entities/player';

export interface ChosenAction {
  action: PlayerActionType;
  amount?: number;
}

const ACTION_NAMES = new Set<string>(Object.values(PlayerAction));

const isPlayerAction = (value: string): value is PlayerActionType =>
  ACTION_NAMES.has(value);

const parseMessage = (
  data: unknown
): { type?: unknown; payload?: unknown } | null => {
  let parsed: unknown = data;

  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  return parsed;
};

export const readReveal = (data: unknown): boolean | null => {
  const message = parseMessage(data);

  if (!message || message.type !== CLIENT_COMMANDS.REVEAL_HOLES) {
    return null;
  }

  const payload = message.payload;

  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  return Boolean((payload as { visible?: unknown }).visible);
};

export const readPlayerAction = (data: unknown): ChosenAction | null => {
  const message = parseMessage(data);

  if (!message || message.type !== CLIENT_COMMANDS.PLAYER_ACTION) {
    return null;
  }

  if (typeof message.payload !== 'object' || message.payload === null) {
    return null;
  }

  const outer = message.payload as { payload?: unknown };
  const inner = outer.payload;

  if (typeof inner !== 'object' || inner === null) {
    return null;
  }

  const action = (inner as { action?: unknown }).action;
  const rawAmount = (inner as { amount?: unknown }).amount;
  const amount = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount);

  if (typeof action !== 'string' || !isPlayerAction(action)) {
    return null;
  }

  return {
    action,
    amount: Number.isFinite(amount) ? amount : undefined,
  };
};
