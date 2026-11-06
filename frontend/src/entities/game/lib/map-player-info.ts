import type { PlayerType as Player } from 'entities/player';

import type { PlayerInfo } from '../model';

export const mapPlayerInfoToPlayer = (
  playerInfo: PlayerInfo,
  seat: number
): Player => ({
  id: playerInfo.id,
  name: playerInfo.name,
  stack: playerInfo.stack,
  seat,
  status: playerInfo.status,
  committed: 0,
  hand: null,
  lastAction: null,
  lastActionAmount: null,
});
