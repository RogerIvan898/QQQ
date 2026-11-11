import { http, HttpResponse } from 'msw';

import { VIEWER_ID } from 'entities/session/model';

import { MOCK_ROOMS } from './room-list';
import { buildMockWsUrl } from './rooms';
import { walletHandlers } from './wallet';

export const httpHandlers = [
  ...walletHandlers,

  http.post('*/auth/login', () =>
    HttpResponse.json({
      accessToken: 'mock-access-token',
      user: { id: VIEWER_ID },
    })
  ),

  http.get('*/auth/me', () => HttpResponse.json({ id: VIEWER_ID })),

  http.post('*/refresh', () =>
    HttpResponse.json({
      accessToken: 'mock-access-token',
    })
  ),

  http.get('*/rooms', () => HttpResponse.json(MOCK_ROOMS)),

  http.get('*/room/:roomId/join', ({ params }) => {
    const roomId = String(params.roomId);

    return HttpResponse.json({
      wsUrl: buildMockWsUrl(roomId),
      ticket: 'mock-ticket',
      expiresIn: 3600,
    });
  }),
];
