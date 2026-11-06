import { createFileRoute } from '@tanstack/react-router';

import { GameRoomPage } from 'pages/game-room';

export const Route = createFileRoute('/game/$roomId')({
  component: GameRoomPage,
});
