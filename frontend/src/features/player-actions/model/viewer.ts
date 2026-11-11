import { combine } from 'effector';

import { gameModel } from 'entities/game';
import { findPlayerById } from 'entities/player';
import { sessionModel } from 'entities/session';

export const $viewer = combine(
  gameModel.$players,
  sessionModel.$currentUserId,
  (players, viewerId) => findPlayerById(players, viewerId) ?? null
);

export const $committedTotal = gameModel.$players.map(players =>
  Object.values(players).reduce((sum, player) => sum + player.committed, 0)
);
