import type { CardType as Card } from 'entities/card';
import type { GameStreet } from 'entities/game';

import type { HandAction, HandRecord } from '../model/types';

export type ReplayStep =
  | { kind: 'start' }
  | { kind: 'action'; action: HandAction }
  | { kind: 'deal'; street: GameStreet }
  | { kind: 'showdown' };

const BOARD_SIZE: Partial<Record<GameStreet, number>> = {
  PREFLOP: 0,
  FLOP: 3,
  TURN: 4,
  RIVER: 5,
};

const STREETS: GameStreet[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

const streetForBoard = (size: number): GameStreet =>
  size >= 5 ? 'RIVER' : size >= 4 ? 'TURN' : size >= 3 ? 'FLOP' : 'PREFLOP';

/** Splits a recorded hand into steps a player can scrub through one by one. */
export const buildTimeline = (hand: HandRecord): ReplayStep[] => {
  const steps: ReplayStep[] = [{ kind: 'start' }];
  let street: GameStreet = 'PREFLOP';

  const dealUpTo = (target: GameStreet) => {
    const from = STREETS.indexOf(street);
    const to = STREETS.indexOf(target);

    for (let index = from + 1; index <= to; index += 1) {
      steps.push({ kind: 'deal', street: STREETS[index] });
    }

    street = target;
  };

  for (const action of hand.actions) {
    if (action.street !== street && STREETS.includes(action.street)) {
      dealUpTo(action.street);
    }

    steps.push({ kind: 'action', action });
  }

  // Board cards dealt with no betting left (everyone all-in, or checked down).
  dealUpTo(streetForBoard(hand.board.length));

  if (hand.winners.length > 0) {
    steps.push({ kind: 'showdown' });
  }

  return steps;
};

export interface ReplaySeat {
  seat: number;
  name: string;
  isMe: boolean;
  stack: number;
  /** Chips in front of the player on the current street. */
  bet: number;
  folded: boolean;
  /** Last action on the current street, for the seat badge. */
  lastAction: HandAction['action'] | null;
  /** `null` = face down. */
  cards: Card[] | null;
  isActing: boolean;
  isWinner: boolean;
}

export interface ReplayState {
  street: GameStreet;
  board: Card[];
  /** Chips collected from previous streets. */
  pot: number;
  seats: ReplaySeat[];
  step: ReplayStep;
}

/** The table as it looked after `stepIndex` steps of `timeline`. */
export const replayState = (
  hand: HandRecord,
  timeline: ReplayStep[],
  stepIndex: number
): ReplayState => {
  const index = Math.max(0, Math.min(stepIndex, timeline.length - 1));
  const seats = new Map<number, ReplaySeat>(
    hand.seats.map(seat => [
      seat.seat,
      {
        seat: seat.seat,
        name: seat.name,
        isMe: seat.isMe,
        stack: seat.stack,
        bet: 0,
        folded: false,
        lastAction: null,
        cards: seat.isMe ? seat.cards : null,
        isActing: false,
        isWinner: false,
      },
    ])
  );
  let street: GameStreet = 'PREFLOP';
  let pot = 0;

  const collectBets = () => {
    for (const seat of seats.values()) {
      pot += seat.bet;
      seat.bet = 0;
      seat.lastAction = null;
    }
  };

  for (let current = 1; current <= index; current += 1) {
    const step = timeline[current];

    if (step.kind === 'action') {
      const seat = seats.get(step.action.seat);

      if (seat) {
        const amount = step.action.amount ?? 0;

        seat.stack -= amount;
        seat.bet += amount;
        seat.lastAction = step.action.action;
        seat.folded ||= step.action.action === 'FOLD';
      }
    } else if (step.kind === 'deal') {
      collectBets();
      street = step.street;
    } else if (step.kind === 'showdown') {
      collectBets();
      street = 'SHOWDOWN';

      for (const recorded of hand.seats) {
        const seat = seats.get(recorded.seat);

        if (seat && !seat.folded && recorded.cards) {
          seat.cards = recorded.cards;
        }
      }

      for (const winner of hand.winners) {
        const seat = seats.get(winner.seat);

        if (seat) {
          seat.stack += winner.amount;
          seat.isWinner = true;
        }
      }

      pot = 0;
    }
  }

  const step = timeline[index];

  if (step.kind === 'action') {
    const acting = seats.get(step.action.seat);

    if (acting) {
      acting.isActing = true;
    }
  }

  const boardSize =
    street === 'SHOWDOWN' ? hand.board.length : (BOARD_SIZE[street] ?? 0);

  return {
    street,
    board: hand.board.slice(0, boardSize),
    pot,
    seats: [...seats.values()],
    step,
  };
};
