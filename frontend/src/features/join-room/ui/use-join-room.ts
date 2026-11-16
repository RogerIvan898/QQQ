import { useNavigate } from '@tanstack/react-router';
import { useUnit } from 'effector-react';

import { $joiningRoomId, joinRoomFx } from '../model';
import { prepareJoinedRoom } from '../model/join-room';

export const useJoinRoom = () => {
  const navigate = useNavigate();
  const [join, joiningRoomId] = useUnit([joinRoomFx, $joiningRoomId]);

  const joinRoom = async (roomId: string) => {
    if (joiningRoomId) {
      return;
    }

    try {
      const result = await join(roomId);
      const { roomId: joinedRoomId, wsUrl } = result;
      prepareJoinedRoom(result);

      void navigate({
        to: '/game/$roomId',
        params: { roomId: joinedRoomId },
        state: { wsUrl },
      });
    } catch (error) {
      console.error('Failed to join room', error);
    }
  };

  return { joinRoom, joiningRoomId };
};
