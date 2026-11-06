import axios, { type AxiosRequestConfig } from 'axios';

import { API_URL } from './constants';

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

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
