import { ws } from 'msw';

import { PokerTable } from './poker/table';
import { getMockRoom } from './rooms';

const roomSocket = ws.link('*/mock-ws/room/:roomId');

let activeTable: PokerTable | null = null;

export const wsHandlers = [
  roomSocket.addEventListener('connection', ({ client, params }) => {
    activeTable?.dispose();

    const table = new PokerTable(client, getMockRoom(String(params.roomId)));
    activeTable = table;

    client.addEventListener('message', event => {
      table.handleMessage(event.data);
    });
    client.addEventListener('close', () => {
      if (activeTable === table) {
        activeTable = null;
      }

      table.dispose();
    });

    table.start();
  }),
];
