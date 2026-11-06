import { parseCard, type CardType as Card } from 'entities/card';
import {
  PlayerAction,
  PlayerStatus,
  type PlayerType as Player,
} from 'entities/player';

import { mapPlayerInfoToPlayer } from '../lib';

import { SERVER_EVENTS } from './constants';
import { getTotalPot } from './pot';
import type * as T from './types';

const reducePlayerSeated = (
  state: T.GameState,
  payload: T.PlayerSeatedEvent['payload']
): T.GameState => ({
  ...state,
  players: {
    ...state.players,
    [payload.seatIndex]: mapPlayerInfoToPlayer(
      payload.player,
      payload.seatIndex
    ),
  },
});

const reduceHandStarted = (
  state: T.GameState,
  payload: T.HandStartedEvent['payload']
): T.GameState => {
  const { smallBlindSeat, bigBlindSeat, initialBets } = payload;

  const resetPlayers = Object.keys(state.players).reduce(
    (acc, key) => {
      acc[key] = {
        ...state.players[key],
        // A fold only lasts for its hand.
        status:
          state.players[key].status === PlayerStatus.FOLDED
            ? PlayerStatus.IN_GAME
            : state.players[key].status,
        committed: initialBets[Number(key)] || 0,
        hand: null,
        lastAction: null,
        lastActionAmount: null,
      };

      return acc;
    },
    {} as Record<string, Player>
  );

  return {
    ...state,
    community: payload.community.slice(0, 5).map(card => parseCard(card)),
    round: 'PREFLOP',
    dealerSeat: payload.dealerSeat,
    bigBlindSeat: bigBlindSeat,
    smallBlindSeat: smallBlindSeat,
    smallBlind: initialBets[smallBlindSeat] || 0,
    bigBlind: initialBets[bigBlindSeat] || 0,
    players: resetPlayers,
    pot: 0,
    currentBet: initialBets[bigBlindSeat] || 0,
  };
};

const reducePlayerActed = (
  state: T.GameState,
  payload: T.PlayerActedEvent['payload']
): T.GameState => {
  const player = state.players[payload.seat];

  if (!player) {
    return state;
  }

  const committed = player.committed + (payload.amount ?? 0);
  const raised =
    payload.action === PlayerAction.BET ||
    payload.action === PlayerAction.RAISE;

  return {
    ...state,
    currentBet: raised
      ? Math.max(state.currentBet, committed)
      : state.currentBet,
    players: {
      ...state.players,
      [payload.seat]: {
        ...player,
        stack: payload.stack,
        status: payload.status,
        committed,
        lastAction: payload.action,
        lastActionAmount:
          payload.amount != null && payload.amount > 0 ? payload.amount : null,
      },
    },
  };
};

const reduceTurnChanged = (
  state: T.GameState,
  payload: T.TurnChangedEvent['payload']
): T.GameState => ({
  ...state,
  activeSeat: payload.activeSeat,
});

const reduceStreetConcluded = (
  state: T.GameState,
  payload: T.StreetConcludedEvent['payload']
): T.GameState => {
  const clearedPlayers = Object.keys(state.players).reduce(
    (acc, key) => {
      acc[key] = {
        ...state.players[key],
        committed: 0,
        lastAction:
          state.players[key].lastAction === PlayerAction.FOLD
            ? PlayerAction.FOLD
            : null,
        lastActionAmount:
          state.players[key].lastAction === PlayerAction.FOLD
            ? state.players[key].lastActionAmount
            : null,
      };
      return acc;
    },
    {} as Record<string, Player>
  );

  return {
    ...state,
    players: clearedPlayers,
    pot: getTotalPot(payload),
    currentBet: 0,
  };
};

const reduceBoardDealt = (
  state: T.GameState,
  payload: T.BoardDealtEvent['payload']
): T.GameState => {
  const incoming = payload.cards.map(card => parseCard(card));
  const latest = incoming[incoming.length - 1];
  let community: Card[];

  if (payload.street === 'FLOP') {
    community = incoming.slice(0, 3);
  } else if (payload.street === 'TURN') {
    const flop = state.community.slice(0, 3);
    community = latest ? [...flop, latest] : flop;
  } else if (payload.street === 'RIVER') {
    const turnBoard = state.community.slice(0, 4);
    community = latest ? [...turnBoard, latest] : turnBoard;
  } else {
    community = incoming.slice(0, 5);
  }

  return {
    ...state,
    round: payload.street,
    community: community.slice(0, 5),
  };
};

const reduceShowdown = (
  state: T.GameState,
  payload: T.ShowdownEvent['payload']
): T.GameState => {
  const revealedPlayers = { ...state.players };

  Object.entries(payload.revealedHands).forEach(([seat, cards]) => {
    if (revealedPlayers[seat]) {
      revealedPlayers[seat] = {
        ...revealedPlayers[seat],
        hand: cards.map(card => parseCard(card)) as [Card, Card],
      };
    }
  });

  return {
    ...state,
    players: revealedPlayers,
  };
};

const reduceHandCompleted = (
  state: T.GameState,
  payload: T.HandCompleteEvent['payload']
): T.GameState => {
  const updatedPlayers = { ...state.players };

  payload.winners.forEach(winner => {
    if (updatedPlayers[winner.seatIndex]) {
      updatedPlayers[winner.seatIndex] = {
        ...updatedPlayers[winner.seatIndex],
        stack: updatedPlayers[winner.seatIndex].stack + winner.amountWon,
      };
    }
  });

  return {
    ...state,
    players: updatedPlayers,
    activeSeat: null,
  };
};

type GameEventReducer = {
  [EventType in T.ServerGameEvent['type']]?: (
    state: T.GameState,
    payload: Extract<T.ServerGameEvent, { type: EventType }>['payload']
  ) => T.GameState;
};

const gameEventReducers: GameEventReducer = {
  [SERVER_EVENTS.PLAYER_SEATED]: reducePlayerSeated,
  [SERVER_EVENTS.HAND_STARTED]: reduceHandStarted,
  [SERVER_EVENTS.PLAYER_ACTED]: reducePlayerActed,
  [SERVER_EVENTS.TURN_CHANGED]: reduceTurnChanged,
  [SERVER_EVENTS.STREET_CONCLUDED]: reduceStreetConcluded,
  [SERVER_EVENTS.BOARD_DEALT]: reduceBoardDealt,
  [SERVER_EVENTS.SHOWDOWN]: reduceShowdown,
  [SERVER_EVENTS.HAND_COMPLETED]: reduceHandCompleted,
};

export const reduceGameEvent = (
  state: T.GameState,
  event: T.ServerGameEvent
): T.GameState => {
  const reduce = gameEventReducers[event.type] as
    | ((
        state: T.GameState,
        payload: T.ServerGameEvent['payload']
      ) => T.GameState)
    | undefined;

  return reduce ? reduce(state, event.payload) : state;
};
