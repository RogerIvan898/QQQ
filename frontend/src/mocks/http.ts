import { http, HttpResponse } from 'msw';

import { VIEWER_ID } from 'entities/session/model';

import { buildMockWsUrl } from './rooms';

export const httpHandlers = [
  http.post('*/auth/login', () => HttpResponse.json(null)),

  http.get('*/auth/me', () =>
    HttpResponse.json({
      id: VIEWER_ID,
      name: 'You',
    })
  ),

  http.post('*/refresh', () =>
    HttpResponse.json({
      accessToken: 'mock-access-token',
    })
  ),

  http.get('*/room/:roomId/join', ({ params }) => {
    const roomId = String(params.roomId);

    return HttpResponse.json({
      wsUrl: buildMockWsUrl(roomId),
      ticket: 'mock-ticket',
      expiresIn: 3600,
    });
  }),
];
