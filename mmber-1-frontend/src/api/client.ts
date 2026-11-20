/**
 * ENERPILOT — CENTRALIZED HTTP CLIENT & TOKEN MANAGER
 * 
 * Production-ready HTTP client built with native Fetch API for communicating
 * with the FastAPI backend.
 * 
 * Adheres strictly to the following architectural rules:
 * 1. Base URL loaded from `import.meta.env.VITE_API_BASE_URL` (default: http://localhost:8000).
 * 2. Unwraps standard backend success envelope: `{ success: true, data: ..., meta?: ... }`.
 * 3. Unwraps standard backend error envelope: `{ success: false, error: { code, message } }`.
 * 4. Token management with in-memory state and sessionStorage recovery.
 * 5. Handles HTTP 204 No Content and empty responses gracefully.
 * 6. Explicit timeouts and network error propagation (never swallows errors with mock data).
 * 7. Never logs sensitive credentials (passwords, tokens).
 */

import { ApiResponse, ApiResponseEnvelope, ApiErrorEnvelope } from './types';

// ==========================================
// Custom API Error Class
// ==========================================

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly meta?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.meta = meta;

    // Maintain standard stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiClientError);
    }
  }
}

// ==========================================
// Centralized Token Manager
// ==========================================

/**
 * SECURITY ARCHITECTURE NOTE:
 * The primary storage for JWT access tokens is in-memory (`inMemoryToken`).
 * To maintain session continuity across page reloads within an active tab,
 * the token is mirrored to `sessionStorage`.
 * 
 * SECURITY TRADE-OFF:
 * `sessionStorage` is scoped to the browser tab and origin. While it prevents
 * persistence across browser restarts, it remains readable by any JavaScript
 * executing in the same origin. It is therefore NOT immune to Cross-Site
 * Scripting (XSS). EnerPilot protects against XSS via strict CSP headers,
 * Content-Type-Options nosniff, and frame denial configured in the backend.
 * 
 * Passwords are NEVER cached or persisted in any client-side storage.
 */

const SESSION_STORAGE_KEY = 'enerpilot_access_token';
let inMemoryToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const tokenManager = {
  getToken(): string | null {
    if (inMemoryToken) {
      return inMemoryToken;
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
          inMemoryToken = stored;
          return stored;
        }
      } catch {
        // Storage access may be blocked in restricted iframe environments
      }
    }
    return null;
  },

  setToken(token: string | null): void {
    inMemoryToken = token;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        if (token) {
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, token);
        } else {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch {
        // Storage access may be blocked
      }
    }
  },

  clearToken(): void {
    this.setToken(null);
  },

  onUnauthorized(callback: (() => void) | null): void {
    unauthorizedHandler = callback;
  },

  notifyUnauthorized(): void {
    this.clearToken();
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
  }
};

// ==========================================
// Query Parameter Serializer
// ==========================================

export type QueryParamValue = string | number | boolean | Date | null | undefined;

export function buildQueryString(params?: Record<string, QueryParamValue>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (value instanceof Date) {
      searchParams.append(key, value.toISOString());
    } else {
      searchParams.append(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

// ==========================================
// Base URL Resolver
// ==========================================

export function getApiBaseUrl(): string {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_API_BASE_URL
    : undefined;
  
  const baseUrl = envUrl || 'http://localhost:8000';
  return baseUrl.replace(/\/+$/, '');
}

// ==========================================
// Core Fetch Wrapper
// ==========================================

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, QueryParamValue>;
  timeoutMs?: number;
  skipAuth?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const {
    body,
    params,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    skipAuth = false,
    headers: customHeaders = {},
    ...customInit
  } = options;

  const baseUrl = getApiBaseUrl();
  const queryString = buildQueryString(params);
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}${cleanEndpoint}${queryString}`;

  const headers = new Headers(customHeaders);

  // Set default JSON headers if not already specified
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach Bearer JWT authentication header
  if (!skipAuth) {
    const token = tokenManager.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // Setup timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...customInit,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError(
        504,
        'REQUEST_TIMEOUT',
        `Network request timed out after ${timeoutMs}ms: ${endpoint}`
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown network failure';
    throw new ApiClientError(0, 'NETWORK_ERROR', `Network failure connecting to ${endpoint}: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  // Handle HTTP 204 No Content
  if (response.status === 204) {
    return { data: undefined as unknown as T };
  }

  // Parse JSON response body
  let responseJson: ApiResponseEnvelope<T> | ApiErrorEnvelope | Record<string, unknown> | null = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      responseJson = await response.json();
    } catch {
      throw new ApiClientError(
        response.status,
        'INVALID_JSON_RESPONSE',
        `Server returned non-parseable JSON from ${endpoint}`
      );
    }
  }

  // Handle 401 Unauthorized globally
  if (response.status === 401) {
    tokenManager.notifyUnauthorized();
  }

  // Process HTTP Errors (status >= 400)
  if (!response.ok) {
    let errorCode = `HTTP_${response.status}`;
    let errorMessage = `HTTP request failed with status ${response.status}`;
    let errorMeta: Record<string, unknown> | undefined;

    if (responseJson && typeof responseJson === 'object') {
      const errorPayload = responseJson as ApiErrorEnvelope;
      if (errorPayload.error && typeof errorPayload.error === 'object') {
        errorCode = errorPayload.error.code || errorCode;
        errorMessage = errorPayload.error.message || errorMessage;
      }
      if (errorPayload.meta && typeof errorPayload.meta === 'object') {
        errorMeta = errorPayload.meta;
      }
    }

    throw new ApiClientError(response.status, errorCode, errorMessage, errorMeta);
  }

  // Parse success envelope: { success: true, data: ..., meta?: ... }
  if (responseJson && typeof responseJson === 'object' && 'success' in responseJson) {
    const successEnvelope = responseJson as ApiResponseEnvelope<T>;
    if (successEnvelope.success === true) {
      return {
        data: successEnvelope.data,
        meta: successEnvelope.meta,
      };
    } else {
      // Backend returned 200 OK with success: false (defensive)
      const err = (responseJson as ApiErrorEnvelope).error;
      throw new ApiClientError(
        response.status,
        err?.code || 'OPERATION_FAILED',
        err?.message || 'Operation failed'
      );
    }
  }

  // Fallback for non-enveloped endpoints like `/health` -> {"status": "ok"}
  return {
    data: (responseJson ?? {}) as T,
  };
}

// ==========================================
// HTTP Method Helpers
// ==========================================

export const httpClient = {
  get<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { ...options, method: 'POST', body });
  },

  put<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { ...options, method: 'PUT', body });
  },

  patch<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { ...options, method: 'PATCH', body });
  },

  delete<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { ...options, method: 'DELETE' });
  },
};
