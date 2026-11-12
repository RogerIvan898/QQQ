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
  } catch {
    return undefined;
  }
};

const send = async (
  method: 'GET' | 'POST',
  url: string,
  data: unknown,
  config: RequestConfig | undefined,
  token: string | null
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const onAbort = () => controller.abort();

  config?.signal?.addEventListener('abort', onAbort, { once: true });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    [APP_HEADER]: APP_HEADER_VALUE,
    ...config?.headers,
  };

  if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    return await fetch(buildUrl(url, config?.params), {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !config?.signal?.aborted) {
      throw new ApiError('timeout', null, 'Request timed out');
    }

    throw new ApiError(
      'network',
      null,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    clearTimeout(timer);
    config?.signal?.removeEventListener('abort', onAbort);
  }
};

const refreshToken = async (): Promise<string> => {
  if (tokenManager.getIsRefreshing()) {
    return tokenManager.addRequestToQueue();
  }

  tokenManager.setIsRefreshing(true);

  try {
    const response = await send('POST', '/refresh', {}, undefined, null);
    const body = (await readBody(response)) as
      | { accessToken?: unknown }
      | undefined;

    if (!response.ok || typeof body?.accessToken !== 'string') {
      throw new ApiError(`http_${response.status}`, response.status);
    }

    tokenManager.setToken(body.accessToken);
    tokenManager.processQueue(null, body.accessToken);

    return body.accessToken;
  } catch (error) {
    const apiError = toApiError(error);

    tokenManager.setToken(null);
    tokenManager.processQueue(apiError, null);
    tokenManager.triggerSessionExpired();

    throw apiError;
  } finally {
    tokenManager.setIsRefreshing(false);
  }
};

const request = async <T>(
  method: 'GET' | 'POST',
  url: string,
  data?: unknown,
  config?: RequestConfig
): Promise<T> => {
  try {
    let response = await send(
      method,
      url,
      data,
      config,
      tokenManager.getToken()
    );

    if (response.status === 401 && !AUTH_CALL.test(url)) {
      const token = await refreshToken();

      response = await send(method, url, data, config, token);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const body = await readBody(response);

    if (!response.ok) {
      throw toApiError({ status: response.status, body });
    }

    if (body === undefined) {
      throw new ApiError('bad_response', response.status);
    }

    return body as T;
  } catch (error) {
    throw toApiError(error);
  }
};

export const api = {
  get: <TResponse>(url: string, config?: RequestConfig) =>
    request<TResponse>('GET', url, undefined, config),

  post: <TResponse, TRequest = unknown>(
    url: string,
    data?: TRequest,
    config?: RequestConfig
  ) => request<TResponse>('POST', url, data, config),
};
