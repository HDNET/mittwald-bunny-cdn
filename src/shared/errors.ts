export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  BUNNY_API_ERROR = 'BUNNY_API_ERROR',
  MITTWALD_API_ERROR = 'MITTWALD_API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  CRYPTO_ERROR = 'CRYPTO_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface AppError {
  type: ErrorType
  message: string
  details?: string
  retryable: boolean
  /**
   * Optional stable identifier for i18n lookup (e.g. `NO_API_KEY`,
   * `INSTANCE_PAUSED`). When present, clients resolve it against the
   * `errors.<code>` translation bundle and fall back to `message` on
   * miss. When absent, `message` is shown verbatim — legacy call sites
   * without a code keep working with their DE string.
   */
  code?: string
  /**
   * Interpolation variables for the `code`-based translation, e.g.
   * `{ field: 'API Key' }` for `EMPTY_FIELD: "{{field}} must not be empty."`.
   * Plain strings / numbers only, because AppError is serialized over RPC.
   */
  variables?: Record<string, string | number>
}

export function createAppError(
  type: ErrorType,
  message: string,
  options?: {
    details?: string
    retryable?: boolean
    code?: string
    variables?: Record<string, string | number>
  },
): AppError {
  return {
    type,
    message,
    details: options?.details,
    retryable: options?.retryable ?? false,
    code: options?.code,
    variables: options?.variables,
  }
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'message' in value &&
    'retryable' in value &&
    typeof (value as AppError).type === 'string' &&
    Object.values(ErrorType).includes((value as AppError).type)
  )
}
