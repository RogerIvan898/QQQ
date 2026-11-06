import type { CardType as Card } from 'entities/card';
import type {
  PlayerActionType,
  PlayerType as Player,
  PlayerStatusType,
} from 'entities/player';

import { CLIENT_COMMANDS, type SERVER_EVENTS } from './constants';

export type GameStreet =
  | 'PREFLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'SHOWDOWN'
  | 'IDLE';

export interface GameState {
  tableId: string | null;
  players: Record<string, Player>;
  dealerSeat: number | null;
  bigBlindSeat: number | null;
  smallBlindSeat: number | null;
  activeSeat: number | null;
  round: GameStreet;
  community: Card[];
  pot: number;
  serverSeq: number;
  bigBlind: number;
  smallBlind: number;
  minimumRaise: number;
  currentBet: number;
}

export interface HandStartedEvent {
  type: typeof SERVER_EVENTS.HAND_STARTED;
  payload: {
    community: string[];
    dealerSeat: number;
    smallBlindSeat: number;
    bigBlindSeat: number;
    initialBets: Record<number, number>;
  };
}

export interface TurnChangedEvent {
  type: typeof SERVER_EVENTS.TURN_CHANGED;
  payload: {
    activeSeat: number;
  };
}

export interface SidePot {
  id: number;
  amount: number;
  eligibleSeatIndexes: number[];
}

export interface StreetConcludedEvent {
  type: typeof SERVER_EVENTS.STREET_CONCLUDED;
  payload: {
    main: number;
    sidePots: SidePot[];
  };
}

export interface AllowedPlayerActionsEvent {
  type: typeof SERVER_EVENTS.ALLOWED_ACTIONS;
  payload: {
    canCheck: boolean;
    canCall: boolean;
    canFold: boolean;
    callAmount: number;
    minRaise: number;
    maxRaise: number;
  };
}

export interface PlayerActedEvent {
  type: typeof SERVER_EVENTS.PLAYER_ACTED;
  payload: {
    seat: number;
    action: PlayerActionType;
    amount?: number;
    stack: number;
    status: PlayerStatusType;
  };
}

export interface PlayerInfo {
  id: string;
  name: string;
  avatar: string;
  stack: number;
  status: PlayerStatusType;
}

export interface PlayerSeatedEvent {
  type: typeof SERVER_EVENTS.PLAYER_SEATED;
  payload: {
    seatIndex: number;
    player: PlayerInfo;
  };
}

interface YourCardsEvent {
  type: typeof SERVER_EVENTS.YOUR_CARDS;
  payload: {
    cards: [string, string];
  };
}

export interface BoardDealtEvent {
  type: typeof SERVER_EVENTS.BOARD_DEALT;
  payload: {
    street: GameStreet;
    cards: string[];
  };
}

export interface ShowdownEvent {
  type: typeof SERVER_EVENTS.SHOWDOWN;
  payload: {
    revealedHands: Record<number, string[]>;
  };
}

export interface HandCompleteEvent {
  type: typeof SERVER_EVENTS.HAND_COMPLETED;
  payload: {
    winners: {
      seatIndex: number;
      amountWon: number;
      combinationName: string;
    }[];
  };
}

export interface DebugHolesEvent {
  type: typeof SERVER_EVENTS.DEBUG_HOLES;
  payload: {
    hands: Record<number, string[]>;
  };
}

export type ServerGameEvent =
  | PlayerSeatedEvent
  | YourCardsEvent
  | AllowedPlayerActionsEvent
  | HandStartedEvent
  | TurnChangedEvent
  | PlayerActedEvent
  | StreetConcludedEvent
  | BoardDealtEvent
  | ShowdownEvent
  | HandCompleteEvent
  | DebugHolesEvent;

type ClientCommands = (typeof CLIENT_COMMANDS)[keyof typeof CLIENT_COMMANDS];

export interface ClientGameEvent {
  type: ClientCommands;
  payload: unknown;
}

export interface GameConnectParams {
  wsUrl: string;
}
