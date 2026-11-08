import { http, HttpResponse } from 'msw';

import { VIEWER_ID } from 'entities/session/model';

import { getMockNickname, setMockNickname } from './profile';
import { buildMockWsUrl } from './rooms';
import { walletHandlers } from './wallet';

export const httpHandlers = [
  ...walletHandlers,

  http.post('*/auth/login', () => HttpResponse.json(null)),

  http.get('*/auth/me', () =>
    HttpResponse.json({
      id: VIEWER_ID,
      nickname: getMockNickname(),
    })
  ),

  http.post('*/profile/nickname', async ({ request }) => {
    const body = (await request.json()) as { nickname?: unknown };
    const result = setMockNickname(
      typeof body.nickname === 'string' ? body.nickname : ''
    );

    return 'error' in result
      ? HttpResponse.json({ error: result.error }, { status: 400 })
      : HttpResponse.json({ nickname: result.nickname });
  }),

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
