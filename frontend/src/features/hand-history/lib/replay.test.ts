import assert from 'node:assert/strict';

import type { HandAction, HandRecord } from '../model/types';

import { buildTimeline, replayState } from './replay';

const act = (
  street: HandAction['street'],
  seat: number,
  action: HandAction['action'],
  amount: number | null = null
): HandAction => ({
  street,
  seat,
  name: `P${seat}`,
  action,
  amount,
  isMe: seat === 0,
});

const card = (rank: string, suit: 'hearts' | 'spades') =>
  ({ rank, suit }) as HandRecord['board'][number];

const hand: HandRecord = {
  id: 'h1',
  roomId: '1',
  startedAt: '2026-11-07T10:00:00.000Z',
  finishedAt: '2026-11-07T10:01:00.000Z',
  smallBlind: 1,
  bigBlind: 2,
  myCards: [card('A', 'spades'), card('K', 'spades')],
  board: [
    card('2', 'hearts'),
    card('7', 'spades'),
    card('9', 'hearts'),
    card('J', 'spades'),
    card('3', 'hearts'),
  ],
  seats: [
    {
      seat: 0,
      name: 'P0',
      isMe: true,
      stack: 100,
      cards: [card('A', 'spades'), card('K', 'spades')],
    },
    {
      seat: 1,
      name: 'P1',
      isMe: false,
      stack: 100,
      cards: [card('Q', 'hearts'), card('Q', 'spades')],
    },
  ],
  actions: [
    act('PREFLOP', 0, 'SB', 1),
    act('PREFLOP', 1, 'BB', 2),
    act('PREFLOP', 0, 'CALL', 1),
    act('PREFLOP', 1, 'CHECK'),
    act('FLOP', 0, 'BET', 4),
    act('FLOP', 1, 'CALL', 4),
  ],
  winners: [
    { seat: 1, name: 'P1', amount: 12, combination: 'Pair', isMe: false },
  ],
  net: -6,
  pot: 12,
};

const timeline = buildTimeline(hand);

assert.deepEqual(
  timeline.map(step =>
    step.kind === 'action'
      ? step.action.action
      : step.kind === 'deal'
        ? step.street
        : step.kind
  ),
  [
    'start',
    'SB',
    'BB',
    'CALL',
    'CHECK',
    'FLOP',
    'BET',
    'CALL',
    'TURN',
    'RIVER',
    'showdown',
  ]
);

const start = replayState(hand, timeline, 0);
assert.equal(start.pot, 0);
assert.equal(start.board.length, 0);
assert.equal(start.seats[0].stack, 100);
assert.equal(start.seats[1].cards, null);

const blinds = replayState(hand, timeline, 2);
assert.equal(blinds.seats[0].bet, 1);
assert.equal(blinds.seats[1].bet, 2);
assert.equal(blinds.seats[1].isActing, true);
assert.equal(blinds.pot, 0);

const flop = replayState(hand, timeline, 5);
assert.equal(flop.pot, 4);
assert.equal(flop.board.length, 3);
assert.equal(flop.seats[0].bet, 0);
assert.equal(flop.seats[0].stack, 98);

const river = replayState(hand, timeline, 9);
assert.equal(river.board.length, 5);
assert.equal(river.pot, 12);

const showdown = replayState(hand, timeline, timeline.length - 1);
assert.equal(showdown.street, 'SHOWDOWN');
assert.equal(showdown.pot, 0);
assert.deepEqual(showdown.seats[1].cards, hand.seats[1].cards);
assert.equal(showdown.seats[1].stack, 94 + 12);
assert.equal(showdown.seats[1].isWinner, true);
assert.equal(showdown.seats[0].stack, 94);

assert.equal(replayState(hand, timeline, 999).street, 'SHOWDOWN');
