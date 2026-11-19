import {
  API_TIMEOUT_MS,
  API_URL,
  APP_HEADER,
  APP_HEADER_VALUE,
} from './constants';
import { ApiError, toApiError } from './errors';
import { tokenManager } from './tokenManager';

// Thin fetch client (axios used to cost ~19 kB gzip on the critical path).
// Same contract as before: JSON in/out, cookies, 15 s timeout, Bearer token
// with one refresh-and-retry on 401, every failure mapped to ApiError.

type Params = Record<string, string | number | boolean | undefined>;

export interface RequestConfig {
  params?: Params;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const AUTH_CALL = /\/(auth\/login|refresh)$/;

const buildUrl = (url: string, params?: Params) => {
  const full = `${API_URL}${url}`;

  if (!params) {
    return full;
  }

  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const search = query.toString();

  return search ? `${full}?${search}` : full;
};

const readBody = async (response: Response): Promise<unknown> => {
  const type = response.headers.get('content-type') ?? '';

  if (!type.includes('json')) {
    return undefined;
  }

  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;

    throw error;
  }
};

const withRequestSignal = async <T>(
  signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const timer = setTimeout(onAbort, API_TIMEOUT_MS);

  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();

  try {
    controller.signal.throwIfAborted();

    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      if (signal?.aborted)
        throw new ApiError('aborted', null, 'Request canceled');

      throw new ApiError('timeout', null, 'Request timed out');
    }

    throw toApiError(error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
};

const send = (
  method: 'GET' | 'POST',
  url: string,
  data: unknown,
  config: RequestConfig | undefined,
  token: string | null,
  signal: AbortSignal
) => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    [APP_HEADER]: APP_HEADER_VALUE,
    ...config?.headers,
  };

  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(buildUrl(url, config?.params), {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
    credentials: 'include',
    signal,
  }).catch((error: unknown) => {
    throw new ApiError(
      'network',
      null,
      error instanceof Error ? error.message : String(error)
    );
  });
};

let refreshing: Promise<string> | undefined;

const refreshToken = () => {
  refreshing ??= withRequestSignal(undefined, async signal => {
    const response = await send(
      'POST',
      '/refresh',
      {},
      undefined,
      null,
      signal
    );
    const body = await readBody(response);
    if (
      !response.ok ||
      typeof body !== 'object' ||
      body === null ||
      !('accessToken' in body) ||
      typeof body.accessToken !== 'string' ||
      !body.accessToken.trim()
    ) {
      throw new ApiError('bad_refresh_response', response.status);
    }

    tokenManager.setToken(body.accessToken);

    return body.accessToken;
  })
    .catch((error: unknown) => {
      tokenManager.setToken(null);
      tokenManager.triggerSessionExpired();

      throw error;
    })
    .finally(() => {
      refreshing = undefined;
    });

  return refreshing;
};

const waitForRefresh = (refresh: Promise<string>, signal: AbortSignal) =>
  new Promise<string>((resolve, reject) => {
    const onAbort = () =>
      reject(new DOMException('Request canceled', 'AbortError'));

    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();

    void refresh.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });

const request = (
  method: 'GET' | 'POST',
  url: string,
  data?: unknown,
  config?: RequestConfig
): Promise<unknown> =>
  withRequestSignal(config?.signal, async signal => {
    const token = tokenManager.getToken();
    let response = await send(method, url, data, config, token, signal);

    if (response.status === 401 && !AUTH_CALL.test(url)) {
      void response.body?.cancel().catch(() => undefined);

      // A late 401 may arrive after another request already refreshed the token.
      const current = tokenManager.getToken();
      const renewed =
        current && current !== token
          ? current
          : await waitForRefresh(refreshToken(), signal);

      signal.throwIfAborted();
      response = await send(method, url, data, config, renewed, signal);
    }

    if (response.status === 204) return undefined;

    const body = await readBody(response);
    if (!response.ok) throw toApiError({ status: response.status, body });
    if (body === undefined) throw new ApiError('bad_response', response.status);

    return body;
  });

export const api = {
  get: (url: string, config?: RequestConfig) =>
    request('GET', url, undefined, config),

  post: (url: string, data?: unknown, config?: RequestConfig) =>
    request('POST', url, data, config),
};
