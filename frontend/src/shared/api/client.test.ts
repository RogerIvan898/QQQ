import assert from 'node:assert/strict';

import { api } from './client';
import { API_TIMEOUT_MS } from './constants';
import { isApiError } from './errors';

const fetchOriginal = globalThis.fetch;
const setTimeoutOriginal = globalThis.setTimeout;
let requests = 0;

globalThis.fetch = new Proxy(fetchOriginal, {
  apply(_target, _this, [, options]: [unknown, RequestInit]) {
    requests += 1;
    const signal = options.signal;
    const body = new ReadableStream({
      start(controller) {
        signal?.addEventListener(
          'abort',
          () => controller.error(signal.reason),
          {
            once: true,
          }
        );
      },
    });

    return Promise.resolve(
      new Response(body, {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  },
});

try {
  const canceled = new AbortController();
  canceled.abort();
  await assert.rejects(
    api.get('/test', { signal: canceled.signal }),
    (error: unknown) => isApiError(error) && error.code === 'aborted'
  );
  assert.equal(requests, 0);

  const active = new AbortController();
  const request = api.get('/test', { signal: active.signal });
  await Promise.resolve();
  active.abort();
  await assert.rejects(
    request,
    (error: unknown) => isApiError(error) && error.code === 'aborted'
  );

  globalThis.setTimeout = new Proxy(setTimeoutOriginal, {
    apply(
      target,
      _receiver,
      [handler, milliseconds, ...args]: [() => void, number?, ...unknown[]]
    ) {
      return target(
        handler,
        milliseconds === API_TIMEOUT_MS ? 5 : milliseconds,
        ...args
      );
    },
  });
  await assert.rejects(
    api.get('/test'),
    (error: unknown) => isApiError(error) && error.code === 'timeout'
  );
} finally {
  globalThis.fetch = fetchOriginal;
  globalThis.setTimeout = setTimeoutOriginal;
}
