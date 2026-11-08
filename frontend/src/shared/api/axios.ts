import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

import { API_URL, API_TIMEOUT_MS } from './constants';
import { ApiError, toApiError } from './errors';
import { setupInterceptors } from './interceptors';

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
});

setupInterceptors(axiosInstance);

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
