/**
 * End of a hand, shared by the event queue, the pot flight and the seats:
 * 1. the winner lights up while the pot still sits in the middle,
 * 2. the pot flies to them,
 * 3. their stack counts up.
 */
export const WINNER_REVEAL_MS = 650;
export const POT_FLIGHT_MS = 750;
export const STACK_COUNT_MS = 450;

/** Until the stack has finished counting up. */
export const HAND_END_MS = WINNER_REVEAL_MS + POT_FLIGHT_MS + STACK_COUNT_MS;
