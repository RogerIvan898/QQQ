import { useNavigate } from '@tanstack/react-router';
import { useUnit } from 'effector-react';

import { $joiningRoomId, joinRequested } from '../model';

export const useJoinRoom = () => {
  const navigate = useNavigate();
  const [join, joiningRoomId] = useUnit([joinRequested, $joiningRoomId]);

  const joinRoom = (roomId: string) => {
    join({
      roomId,
      onJoined: ({ roomId: joinedRoomId }) => {
        void navigate({
          to: '/game/$roomId',
          params: { roomId: joinedRoomId },
        });
      },
    });
  };

  return { joinRoom, joiningRoomId };
};
