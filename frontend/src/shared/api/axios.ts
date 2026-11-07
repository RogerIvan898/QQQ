import axios, { type AxiosRequestConfig } from 'axios';

import { API_URL } from './constants';
import { setupInterceptors } from './interceptors';

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// App header, Bearer token and one 401 → /refresh retry for every request.
setupInterceptors(axiosInstance);

export const api = {
  get: <TResponse>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<TResponse> =>
    axiosInstance.get<TResponse>(url, config).then(res => res.data),

  post: <TResponse, TRequest = unknown>(
    url: string,
    data?: TRequest,
    config?: AxiosRequestConfig<TRequest>
  ): Promise<TResponse> =>
    axiosInstance.post<TResponse>(url, data, config).then(res => res.data),
};
