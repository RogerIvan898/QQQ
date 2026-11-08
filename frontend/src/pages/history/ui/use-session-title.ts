import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';

import { $rooms, findRoom } from 'entities/room';
import type { GameSession } from 'features/game-sessions';

export const useSessionTitle = () => {
  const { t } = useLingui();
  const rooms = useUnit($rooms);

  return (session: GameSession) => {
    const room = findRoom(rooms, session.roomId);
    const name = room ? room.name : t`Table #${session.roomId}`;

    return session.format ? `${name} · ${session.format}` : name;
  };
};
