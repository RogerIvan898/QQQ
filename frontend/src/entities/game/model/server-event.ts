import { PlayerAction, PlayerStatus } from 'entities/player';
import { isFiniteNumber, isRecord } from 'shared/utils/validation';

import { SERVER_EVENTS } from './constants';
import type { ServerGameEvent } from './types';

const streets = new Set([
  'FLOP',
  'TURN',
  'RIVER',
  'PREFLOP',
  'SHOWDOWN',
  'IDLE',
]);
const statuses = new Set<unknown>(Object.values(PlayerStatus));
const actions = new Set<unknown>(Object.values(PlayerAction));

const isSeat = (value: unknown) =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 0;

const isAmount = (value: unknown) => isFiniteNumber(value) && value >= 0;

const isCardList = (value: unknown) =>
  Array.isArray(value) &&
  value.every(
    card => typeof card === 'string' && /^(?:10|[2-9JQKA])[hdcs]$/.test(card)
  );

const isSeatMap = (value: unknown, validate: (item: unknown) => boolean) =>
  isRecord(value) &&
  Object.entries(value).every(
    ([seat, item]) => /^\d+$/.test(seat) && validate(item)
  );

const isPlayer = (value: unknown) =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.avatar === 'string' &&
  isAmount(value.stack) &&
  statuses.has(value.status);

const payloadValidators = {
  [SERVER_EVENTS.HAND_STARTED]: p =>
    isCardList(p.community) &&
    isSeat(p.dealerSeat) &&
    isSeat(p.smallBlindSeat) &&
    isSeat(p.bigBlindSeat) &&
    isSeatMap(p.initialBets, isAmount) &&
    (p.game === undefined || p.game === 'nlh' || p.game === 'plo'),
  [SERVER_EVENTS.PLAYER_SEATED]: p => isSeat(p.seatIndex) && isPlayer(p.player),
  [SERVER_EVENTS.TURN_CHANGED]: p =>
    isSeat(p.activeSeat) &&
    (p.turnMs === undefined || isAmount(p.turnMs)) &&
    (p.timeBankMs === undefined || isAmount(p.timeBankMs)),
  [SERVER_EVENTS.STREET_CONCLUDED]: p =>
    isAmount(p.main) &&
    Array.isArray(p.sidePots) &&
    p.sidePots.every(
      pot =>
        isRecord(pot) &&
        isSeat(pot.id) &&
        isAmount(pot.amount) &&
        Array.isArray(pot.eligibleSeatIndexes) &&
        pot.eligibleSeatIndexes.every(isSeat)
    ),
  [SERVER_EVENTS.PLAYER_ACTED]: p =>
    isSeat(p.seat) &&
    actions.has(p.action) &&
    isAmount(p.stack) &&
    statuses.has(p.status) &&
    (p.amount === undefined || isAmount(p.amount)),
  [SERVER_EVENTS.YOUR_CARDS]: p => isCardList(p.cards),
  [SERVER_EVENTS.ALLOWED_ACTIONS]: p =>
    typeof p.canCheck === 'boolean' &&
    typeof p.canCall === 'boolean' &&
    typeof p.canFold === 'boolean' &&
    isAmount(p.callAmount) &&
    isAmount(p.minRaise) &&
    isAmount(p.maxRaise),
  [SERVER_EVENTS.BOARD_DEALT]: p =>
    typeof p.street === 'string' &&
    streets.has(p.street) &&
    isCardList(p.cards),
  [SERVER_EVENTS.SHOWDOWN]: p => isSeatMap(p.revealedHands, isCardList),
  [SERVER_EVENTS.HAND_COMPLETED]: p =>
    Array.isArray(p.winners) &&
    p.winners.every(
      winner =>
        isRecord(winner) &&
        isSeat(winner.seatIndex) &&
        isAmount(winner.amountWon) &&
        typeof winner.combinationName === 'string'
    ),
  [SERVER_EVENTS.DEBUG_HOLES]: p => isSeatMap(p.hands, isCardList),
  [SERVER_EVENTS.PLAYER_STATUS]: p =>
    isSeat(p.seat) &&
    statuses.has(p.status) &&
    (p.returning === undefined || typeof p.returning === 'boolean'),
} satisfies Record<
  ServerGameEvent['type'],
  (payload: Record<string, unknown>) => boolean
>;

export const isServerGameEvent = (value: unknown): value is ServerGameEvent => {
  if (
    !isRecord(value) ||
    typeof value.type !== 'string' ||
    !isRecord(value.payload)
  ) {
    return false;
  }

  return (
    Object.hasOwn(payloadValidators, value.type) &&
    payloadValidators[value.type as ServerGameEvent['type']](value.payload)
  );
};
