import type {} from '@tanstack/router-core';
import assert from 'node:assert/strict';
import { chromium, type Browser, type WebSocketRoute } from 'playwright';
import { createServer } from 'vite';

import { checkWithdrawalRetry } from './withdrawal.e2e.ts';

process.env.VITE_API_URL = '/api';
process.env.VITE_MOCK_SERVER = 'false';
process.env.VITE_BASE_PATH = '/';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
let browser: Browser | undefined;
const audio = Promise.withResolvers<void>();
const timeout = AbortSignal.timeout(60_000);
const deadline = new Promise<never>((_, reject) => {
  timeout.addEventListener(
    'abort',
    () => reject(new Error('Timed out waiting for game socket')),
    { once: true }
  );
});
void deadline.catch(() => undefined);

try {
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  assert.ok(base);

  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
  const page = await browser.newPage({ locale: 'en-US' });
  const joined: string[] = [];
  const connected = Promise.withResolvers<WebSocketRoute>();
  const disconnected = Promise.withResolvers<void>();
  const second = Promise.withResolvers<WebSocketRoute>();
  const reconnected = Promise.withResolvers<WebSocketRoute>();
  let openedRoomTwo = false;

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();

    if (url.pathname === '/api/auth/login') {
      return route.fulfill({ json: { user: { id: '100' } } });
    }

    if (url.pathname === '/api/wallet/balance') {
      return route.fulfill({ json: { available: 20 } });
    }

    if (url.pathname === '/api/rooms') {
      return route.fulfill({
        json: [1, 2].map(id => ({
          id,
          name: `Table ${id}`,
          mode: 'cash',
          blinds: '0.05/0.10',
          max: 6,
          players: 2,
          minBuy: 1,
          maxBuy: 10,
        })),
      });
    }

    const room = /^\/api\/room\/(\d+)\/join$/.exec(url.pathname)?.[1];
    if (room) {
      joined.push(room);
      return route.fulfill({
        json: { wsUrl: `ws://${url.host}/test-table/${room}`, expiresIn: 3600 },
      });
    }

    if (
      url.pathname.endsWith('.mp3') &&
      route.request().resourceType() === 'fetch'
    ) {
      await audio.promise;
      return route.abort();
    }

    return route.continue();
  });

  await page.routeWebSocket('**/test-table/*', socket => {
    if (socket.url().endsWith('/2')) {
      if (openedRoomTwo) {
        reconnected.resolve(socket);
      } else {
        openedRoomTwo = true;
        second.resolve(socket);
      }
    } else {
      socket.onClose(() => disconnected.resolve());
      connected.resolve(socket);
    }
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  const socket = await Promise.race([connected.promise, deadline]);
  socket.send(
    JSON.stringify({
      type: 'EV_PLAYER_SEATED',
      payload: {
        seatIndex: 0,
        player: {
          id: '100',
          name: 'Hero',
          avatar: '',
          stack: 95,
          status: 'IN_GAME',
        },
      },
    })
  );

  await page.getByRole('button', { name: 'Tables', exact: true }).waitFor();
  socket.send(
    JSON.stringify({
      type: 'EV_HAND_STARTED',
      payload: {
        community: [],
        dealerSeat: 0,
        smallBlindSeat: 0,
        bigBlindSeat: 1,
        initialBets: { 0: 5, 1: 10 },
      },
    })
  );
  socket.send(
    JSON.stringify({
      type: 'EV_HAND_COMPLETED',
      payload: {
        winners: [{ seatIndex: 0, amountWon: 15, combinationName: 'Pair' }],
      },
    })
  );

  await page.waitForFunction(() =>
    localStorage.getItem('poker:game-session-draft:100')?.includes('"hands":1')
  );
  await page.evaluate(() => window.__TSR_ROUTER__!.navigate({ to: '/game/2' }));
  await Promise.race([
    Promise.all([disconnected.promise, second.promise]),
    deadline,
  ]);
  assert.deepEqual(joined, ['1', '2']);

  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('poker:game-sessions:100') ?? '[]') as {
        hands: number;
        net: number;
      }[]
  );
  assert.equal(saved[0]?.hands, 1);
  assert.equal(saved[0]?.net, 0.1);
  console.log(
    'Passed room change, audio-independent entry and completed-hand accounting.'
  );

  const secondSocket = await second.promise;
  const allowedActions = JSON.stringify({
    type: 'EV_ALLOWED_ACTIONS',
    payload: {
      canCheck: true,
      canCall: false,
      canFold: true,
      callAmount: 0,
      minRaise: 0,
      maxRaise: 95,
    },
  });
  secondSocket.send(
    JSON.stringify({
      type: 'EV_PLAYER_SEATED',
      payload: {
        seatIndex: 0,
        player: {
          id: '100',
          name: 'Hero',
          avatar: '',
          stack: 95,
          status: 'IN_GAME',
        },
      },
    })
  );
  secondSocket.send(allowedActions);
  const check = page.getByRole('button', { name: 'Check', exact: true });
  await check.waitFor();

  await secondSocket.close({ code: 1012, reason: 'fixture reconnect' });
  const newSocket = await Promise.race([reconnected.promise, deadline]);
  await check.waitFor({ state: 'hidden' });
  newSocket.send(
    JSON.stringify({ type: 'EV_BOARD_DEALT', payload: { street: 'FLOP' } })
  );
  newSocket.send(allowedActions);
  const playerAction = Promise.withResolvers<unknown>();
  newSocket.onMessage(message => {
    if (String(message).includes('CMD_PLAYER_ACTION')) {
      playerAction.resolve(JSON.parse(String(message)));
    }
  });
  await check.click();
  assert.deepEqual(await Promise.race([playerAction.promise, deadline]), {
    type: 'CMD_PLAYER_ACTION',
    payload: { action: 'CHECK' },
  });
  console.log(
    'Passed reconnect permission reset and malformed game message handling.'
  );

  audio.resolve();
  await checkWithdrawalRetry(page);

  await page.route(/\/locales\/en\/messages\.po(?:\?|$)/, route =>
    route.abort()
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page
    .getByRole('alert')
    .getByText('Could not load translations.')
    .waitFor();
  assert.ok(await page.getByRole('button', { name: 'Retry' }).isEnabled());
  console.log('Passed application startup with an unavailable locale catalog.');
} finally {
  audio.resolve();
  await browser?.close();
  await server.close();
}
