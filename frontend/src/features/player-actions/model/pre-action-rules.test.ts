import assert from 'node:assert/strict';

import {
  canPreAct,
  chipsToCall,
  decidePreAction,
  formatCallBb,
  isPreActionStale,
} from './pre-action-rules';

const open = { canCheck: true, canCall: false };
const facing = { canCheck: false, canCall: true };

assert.equal(decidePreAction('check', open), 'check');
assert.equal(decidePreAction('check', facing), null);
assert.equal(decidePreAction('check_fold', open), 'check');
assert.equal(decidePreAction('check_fold', facing), 'fold');
assert.equal(decidePreAction('call', facing), 'call');
assert.equal(decidePreAction('call', open), null);

assert.equal(chipsToCall(100, 20, 50), 50);
assert.equal(chipsToCall(40, 40, 200), 0);
assert.equal(chipsToCall(10, 0, 0), 0);

assert.equal(formatCallBb(50, 20), '2.5');
assert.equal(formatCallBb(40, 20), '2');
assert.equal(formatCallBb(25, 0), '25');

assert.equal(isPreActionStale('check', 10), true);
assert.equal(isPreActionStale('check', 0), false);
assert.equal(isPreActionStale('call', 0), true);
assert.equal(isPreActionStale('call', 10), false);
assert.equal(isPreActionStale('check_fold', 10), false);

assert.equal(canPreAct('IN_GAME'), true);
assert.equal(canPreAct('RAISE'), true);
assert.equal(canPreAct('ALL_IN'), false);
assert.equal(canPreAct('FOLDED'), false);
assert.equal(canPreAct(undefined), false);
