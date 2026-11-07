import type { GameState } from 'entities/game';
import { PlayerStatus, type PlayerType as Player } from 'entities/player';

import type { HandRecord } from '../model/types';

import type { ReplayState } from './replay';

/**
 * Turns a replay step into the live game state shape, so the real table
 * widget can draw it exactly as it looked during play.
 */
export const toGameState = (
  hand: HandRecord,
  replay: ReplayState,
  viewerId: string | null
): GameState => {
  const players: Record<string, Player> = {};

  for (const seat of replay.seats) {
    const isBlind = seat.lastAction === 'SB' || seat.lastAction === 'BB';

    players[seat.seat] = {
      // The table finds "you" by id; everyone else just needs a stable one.
      id: seat.isMe && viewerId ? viewerId : `replay-${seat.seat}`,
      name: seat.name,
      stack: seat.stack,
      seat: seat.seat,
      status: seat.folded ? PlayerStatus.FOLDED : PlayerStatus.IN_GAME,
      hand:
        seat.cards && seat.cards.length === 2
          ? [seat.cards[0], seat.cards[1]]
          : null,
      committed: seat.bet,
      // Blinds are shown by the table's own SB/BB badge, not as an action.
      lastAction:
        seat.lastAction === 'SB' || seat.lastAction === 'BB'
          ? null
          : seat.lastAction,
      lastActionAmount: isBlind ? null : seat.bet || null,
    };
  }

  const acting = replay.seats.find(seat => seat.isActing);

  return {
    tableId: hand.roomId,
    players,
    dealerSeat: hand.dealerSeat ?? null,
    smallBlindSeat: hand.smallBlindSeat ?? null,
    bigBlindSeat: hand.bigBlindSeat ?? null,
    activeSeat: acting?.seat ?? null,
    round: replay.street,
    community: replay.board,
    pot: replay.pot,
    serverSeq: 0,
    bigBlind: hand.bigBlind,
    smallBlind: hand.smallBlind,
    minimumRaise: hand.bigBlind,
    currentBet: Math.max(0, ...replay.seats.map(seat => seat.bet)),
  };
};
