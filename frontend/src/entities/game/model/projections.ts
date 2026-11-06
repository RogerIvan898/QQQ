import { parseCard, type CardType as Card } from 'entities/card';
import type { PlayerType as Player } from 'entities/player';

import { SERVER_EVENTS } from './constants';
import type { AllowedPlayerActionsEvent, ServerGameEvent } from './types';

export const reduceMyCards = (
  cards: Player['hand'],
  event: ServerGameEvent
): Player['hand'] => {
  if (event.type === SERVER_EVENTS.YOUR_CARDS) {
    return event.payload.cards.map(card => parseCard(card)) as [Card, Card];
  }

  if (
    event.type === SERVER_EVENTS.HAND_STARTED ||
    event.type === SERVER_EVENTS.HAND_COMPLETED
  ) {
    return null;
  }

  return cards;
};

export const reduceAllowedActions = (
  actions: AllowedPlayerActionsEvent['payload'] | null,
  event: ServerGameEvent
): AllowedPlayerActionsEvent['payload'] | null => {
  if (event.type === SERVER_EVENTS.ALLOWED_ACTIONS) {
    return event.payload;
  }

  if (
    event.type === SERVER_EVENTS.PLAYER_ACTED ||
    event.type === SERVER_EVENTS.STREET_CONCLUDED
  ) {
    return null;
  }

  return actions;
};

export const reduceDebugHoles = (
  holes: Record<number, [Card, Card]>,
  event: ServerGameEvent
): Record<number, [Card, Card]> => {
  if (event.type === SERVER_EVENTS.DEBUG_HOLES) {
    return Object.entries(event.payload.hands).reduce(
      (hands, [seat, cards]) => {
        const [first, second] = cards;

        if (first && second) {
          hands[Number(seat)] = [parseCard(first), parseCard(second)];
        }

        return hands;
      },
      {} as Record<number, [Card, Card]>
    );
  }

  if (event.type === SERVER_EVENTS.HAND_STARTED) {
    return {};
  }

  return holes;
};
