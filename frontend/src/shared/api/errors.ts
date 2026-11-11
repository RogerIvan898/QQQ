import { AxiosError } from 'axios';

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;

  constructor(code: string, status: number | null, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof ApiError;

const bodyCode = (data: unknown) => {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const { error, code } = data as { error?: unknown; code?: unknown };

  return typeof error === 'string'
    ? error
    : typeof code === 'string'
      ? code
      : null;
};

export const toApiError = (error: unknown): ApiError => {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (error.code === AxiosError.ECONNABORTED || error.code === 'ETIMEDOUT') {
      return new ApiError('timeout', null, error.message);
    }

    if (!error.response) {
      return new ApiError('network', null, error.message);
    }

    const { status } = error.response;
    const data: unknown = error.response.data;

    return new ApiError(bodyCode(data) ?? `http_${status}`, status);
  }

  return new ApiError(
    'unknown',
    null,
    error instanceof Error ? error.message : String(error)
  );
};
