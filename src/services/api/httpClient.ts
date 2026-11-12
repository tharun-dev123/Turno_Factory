import {
  AuthError,
  BusyError,
  ConflictError,
  DuplicateBarcodeError,
  InternalError,
  NetworkError,
  NotFoundError,
  ServiceError,
  TimeoutError,
  ValidationError,
} from '../errors';
import { expireSession, getAccessToken } from '../sessionStore';
import type { ApiEnvelope, ApiErrorBody } from './types';

/**
 * HTTP client for the Apps Script backend.
 *
 * - One POST endpoint; the body is JSON sent as text/plain (no CORS preflight; Apps Script cannot read headers).
 * - Always inspects the JSON `ok` flag and error `code`; never relies on HTTP status codes.
 * - Per-attempt timeout (AbortController) and bounded retries with backoff for transient failures only
 *   (network errors, timeouts, BUSY). A write is retried ONLY when it carries a requestId, and every retry
 *   re-sends the SAME requestId, so the server can recognise it and never applies it twice.
 */

export interface ApiClientConfig {
  baseUrl: string;
  readTimeoutMs: number;
  writeTimeoutMs: number;
  loginTimeoutMs: number;
  /** Extra attempts after the first */
  maxRetries: number;
  retryBackoffMs: readonly number[];
  readBudgetMs: number;
  writeBudgetMs: number;
}

export type RequestKind = 'read' | 'write' | 'login';

export interface CallOptions {
  kind: RequestKind;
  /** Send the session token (default: true except for login/health) */
  auth?: boolean;
  /** Idempotency key. Required for a write to be retried automatically. */
  requestId?: string;
}

export interface ApiClient {
  call<T>(action: string, payload: Record<string, unknown>, options: CallOptions): Promise<T>;
}

export interface ApiClientDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

const TOKEN_REASONS = new Set(['TOKEN_EXPIRED', 'TOKEN_INVALID']);

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asFieldErrors(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(value)) if (typeof message === 'string') out[key] = message;
  return out;
}

/** Maps a backend error body to the typed errors the UI already understands. */
export function mapApiError(error: ApiErrorBody): ServiceError {
  const details = (typeof error.details === 'object' && error.details !== null ? error.details : {}) as Record<string, unknown>;
  switch (error.code) {
    case 'DUPLICATE_BARCODE': {
      const existing = details.existing as { id?: unknown; serialNumber?: unknown } | undefined;
      return new DuplicateBarcodeError(
        asString(details.barcode) ?? '',
        existing && typeof existing.id === 'string' && typeof existing.serialNumber === 'number'
          ? { id: existing.id, serialNumber: existing.serialNumber }
          : undefined,
      );
    }
    case 'VALIDATION':
      return new ValidationError(error.message, asFieldErrors(details.fieldErrors));
    case 'NOT_FOUND':
      return new NotFoundError(error.message);
    case 'AUTH':
      return new AuthError(error.message, asString(details.reason));
    case 'CONFLICT':
      return new ConflictError(error.message);
    case 'BUSY':
      return new BusyError(error.message);
    case 'INTERNAL':
      return new InternalError(error.message, asString(details.recovery));
    default:
      return new ServiceError('UNKNOWN', error.message || 'Unexpected server error.');
  }
}

function parseEnvelope(text: string): ApiEnvelope<unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // For example an HTML error/sign-in page from Google instead of the API response.
    throw new NetworkError('The server sent an unexpected response. Please try again.');
  }
  if (typeof parsed === 'object' && parsed !== null && 'ok' in parsed) {
    const envelope = parsed as { ok: unknown; data?: unknown; error?: unknown };
    if (envelope.ok === true) return { ok: true, data: envelope.data };
    const err = envelope.error as Partial<ApiErrorBody> | undefined;
    if (envelope.ok === false && err && typeof err.code === 'string') {
      return { ok: false, error: { code: err.code, message: typeof err.message === 'string' ? err.message : '', details: err.details } };
    }
  }
  throw new NetworkError('The server sent an unexpected response. Please try again.');
}

export function createApiClient(getConfig: () => ApiClientConfig, deps: ApiClientDeps = {}): ApiClient {
  const fetchImpl = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;

  async function postOnce(url: string, body: string, timeoutMs: number): Promise<ApiEnvelope<unknown>> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body,
          signal: controller.signal,
          redirect: 'follow',
        });
      } catch {
        throw timedOut ? new TimeoutError() : new NetworkError();
      }
      let text: string;
      try {
        text = await response.text();
      } catch {
        throw timedOut ? new TimeoutError() : new NetworkError('The connection was interrupted. Please try again.');
      }
      return parseEnvelope(text);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async call<T>(action: string, payload: Record<string, unknown>, options: CallOptions): Promise<T> {
      const config = getConfig();
      if (!config.baseUrl) throw new Error('The backend URL is not configured (EXPO_PUBLIC_API_URL).');

      const useAuth = options.auth ?? options.kind !== 'login';
      let token: string | null = null;
      if (useAuth) {
        token = await getAccessToken();
        if (!token) {
          await expireSession();
          throw new AuthError('Please sign in again.', 'TOKEN_INVALID');
        }
      }

      const body = JSON.stringify({
        action,
        payload,
        ...(token ? { token } : {}),
        ...(options.requestId ? { requestId: options.requestId } : {}),
      });

      const timeoutMs =
        options.kind === 'write' ? config.writeTimeoutMs : options.kind === 'login' ? config.loginTimeoutMs : config.readTimeoutMs;
      const budgetMs = options.kind === 'write' ? config.writeBudgetMs : config.readBudgetMs;
      // A write without a requestId could be applied twice, so it is never retried automatically.
      const maxRetries =
        options.kind === 'write' && !options.requestId ? 0 : options.kind === 'login' ? Math.min(config.maxRetries, 1) : config.maxRetries;

      const startedAt = now();
      for (let attempt = 0; ; attempt += 1) {
        try {
          const envelope = await postOnce(config.baseUrl, body, timeoutMs);
          if (envelope.ok) return envelope.data as T;
          throw mapApiError(envelope.error);
        } catch (error) {
          if (error instanceof AuthError && error.reason && TOKEN_REASONS.has(error.reason)) {
            await expireSession();
          }
          const transient = error instanceof NetworkError || error instanceof BusyError;
          const base = config.retryBackoffMs[Math.min(attempt, config.retryBackoffMs.length - 1)] ?? 1000;
          const delay = Math.round(base * (0.8 + random() * 0.4));
          if (!transient || attempt >= maxRetries || now() - startedAt + delay > budgetMs) throw error;
          await sleep(delay);
        }
      }
    },
  };
}
