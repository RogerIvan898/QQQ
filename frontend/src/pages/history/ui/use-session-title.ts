import { useLingui } from '@lingui/react/macro';

import { findRoom } from 'entities/room';
import type { GameSession } from 'features/game-sessions';

/** "Micro · 9-Max", falling back to the table id for unknown rooms. */
export const useSessionTitle = () => {
  const { i18n, t } = useLingui();

  return (session: GameSession) => {
    const room = findRoom(session.roomId);
    const name = room ? i18n._(room.name) : t`Table #${session.roomId}`;

    return session.format ? `${name} · ${session.format}` : name;
  };
};
