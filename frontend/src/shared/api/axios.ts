import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

import { API_URL, API_TIMEOUT_MS } from './constants';
import { ApiError, toApiError } from './errors';
import { setupInterceptors } from './interceptors';

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
});

// App header, Bearer token and one 401 → /refresh retry for every request.
setupInterceptors(axiosInstance);

/**
 * The API always answers JSON (or nothing: 204). Anything else, typically an
 * HTML page from a misrouted proxy or the SPA fallback, is an error, not data:
 * otherwise `undefined` fields leak into the stores.
 */
const unwrap = <T>(response: AxiosResponse<T>): T => {
  if (response.status === 204) {
    return undefined as T;
  }

  const type = String(response.headers['content-type'] ?? '');

  if (!type.includes('json')) {
    throw new ApiError('bad_response', response.status);
  }

  return response.data;
};

const call = async <T>(request: Promise<AxiosResponse<T>>): Promise<T> => {
  try {
    return unwrap(await request);
  } catch (error) {
    throw toApiError(error);
  }
};

export const api = {
  get: <TResponse>(url: string, config?: AxiosRequestConfig) =>
    call(axiosInstance.get<TResponse>(url, config)),

  post: <TResponse, TRequest = unknown>(
    url: string,
    data?: TRequest,
    config?: AxiosRequestConfig<TRequest>
  ) => call(axiosInstance.post<TResponse>(url, data, config)),
};
