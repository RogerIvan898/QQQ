import { AxiosError } from 'axios';

/**
 * One error shape for every API call. `code` is the backend's machine code
 * (`{ "error": "short" }` / `{ "code": "..." }`), or a client-side one:
 * - `network`: no response (offline, CORS, server down),
 * - `timeout`: no answer in time,
 * - `bad_response`: not JSON (e.g. a web server's HTML page instead of the API).
 */
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

/** Turns whatever axios threw into an ApiError. */
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
