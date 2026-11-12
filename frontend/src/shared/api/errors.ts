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

  // Non-2xx response handed over by the client as { status, body }.
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    const { status } = error;
    const body = 'body' in error ? error.body : undefined;

    return new ApiError(bodyCode(body) ?? `http_${status}`, status);
  }

  return new ApiError(
    'unknown',
    null,
    error instanceof Error ? error.message : String(error)
  );
};
