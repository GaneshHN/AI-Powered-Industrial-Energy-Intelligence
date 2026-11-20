/**
 * ENERPILOT — FRONTEND API CLIENT & SERVICES TEST SUITE
 * 
 * Focused unit tests verifying:
 * 1. Successful response unwrapping ({ success: true, data, meta } -> { data, meta })
 * 2. Error response parsing ({ success: false, error: { code, message } } -> ApiClientError)
 * 3. HTTP 204 No Content handling
 * 4. Authorization Bearer header attachment
 * 5. Missing token handling & 401 callback notification
 * 6. Network failure handling (status 0, code NETWORK_ERROR)
 * 7. Request timeout handling (status 504, code REQUEST_TIMEOUT)
 * 8. Query parameter serialization (dates, numbers, strings, null/undefined filtering)
 * 9. API namespaces verification (auth, factories, machines, energy, etc.)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  httpClient,
  tokenManager,
  ApiClientError,
  buildQueryString,
  getApiBaseUrl,
  request
} from './client';
import { api } from './index';

// ==========================================
// Mock Fetch Infrastructure
// ==========================================

let originalFetch: typeof globalThis.fetch;
let lastRequestUrl = '';
let lastRequestInit: RequestInit | undefined;

function mockFetchResponse(status: number, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    lastRequestUrl = input.toString();
    lastRequestInit = init;

    const responseHeaders = new Headers(headers);
    const bodyText = status === 204 ? null : (typeof body === 'string' ? body : JSON.stringify(body));

    return new Response(bodyText, {
      status,
      statusText: status === 200 ? 'OK' : status === 204 ? 'No Content' : 'Error',
      headers: responseHeaders,
    });
  };
}

function mockFetchNetworkError(errorMessage = 'Failed to fetch') {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    lastRequestUrl = input.toString();
    lastRequestInit = init;
    throw new TypeError(errorMessage);
  };
}

function mockFetchTimeout() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    lastRequestUrl = input.toString();
    lastRequestInit = init;
    const error = new DOMException('The operation was aborted', 'AbortError');
    throw error;
  };
}

// ==========================================
// Test Suites
// ==========================================

describe('EnerPilot API Client Test Suite', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    tokenManager.clearToken();
    tokenManager.onUnauthorized(null);
    lastRequestUrl = '';
    lastRequestInit = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    tokenManager.clearToken();
  });

  it('1. Successfully unwraps standard success envelope', async () => {
    mockFetchResponse(200, {
      success: true,
      data: { id: 'fact-01', name: 'Pune Plant' },
      meta: { total: 1 }
    });

    const response = await httpClient.get<{ id: string; name: string }>('/api/factories/fact-01');
    assert.deepEqual(response.data, { id: 'fact-01', name: 'Pune Plant' });
    assert.deepEqual(response.meta, { total: 1 });
  });

  it('2. Parses error envelopes into typed ApiClientError', async () => {
    mockFetchResponse(404, {
      success: false,
      error: { code: 'RESOURCE_NOT_FOUND', message: 'Machine not found' }
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/api/machines/non-existent-id');
      },
      (err: unknown) => {
        assert(err instanceof ApiClientError);
        assert.equal(err.status, 404);
        assert.equal(err.code, 'RESOURCE_NOT_FOUND');
        assert.equal(err.message, 'Machine not found');
        return true;
      }
    );
  });

  it('3. Handles HTTP 204 No Content responses cleanly', async () => {
    mockFetchResponse(204, null, {});

    const response = await httpClient.delete<void>('/api/factories/f47ac10b-58cc-4372-a567-0e02b2c3d479');
    assert.equal(response.data, undefined);
  });

  it('4. Attaches Bearer JWT Authorization header when token exists', async () => {
    tokenManager.setToken('jwt-sample-token-12345');
    mockFetchResponse(200, { success: true, data: { status: 'ok' } });

    await httpClient.get('/api/auth/me');

    const headers = lastRequestInit?.headers as Headers;
    assert.equal(headers.get('Authorization'), 'Bearer jwt-sample-token-12345');
  });

  it('5. Omits Authorization header when token is missing and handles 401 callback', async () => {
    tokenManager.clearToken();
    let unauthorizedTriggered = false;
    tokenManager.onUnauthorized(() => {
      unauthorizedTriggered = true;
    });

    mockFetchResponse(401, {
      success: false,
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required' }
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/api/auth/me');
      },
      (err: unknown) => {
        assert(err instanceof ApiClientError);
        assert.equal(err.status, 401);
        assert.equal(err.code, 'AUTHENTICATION_REQUIRED');
        return true;
      }
    );

    const headers = lastRequestInit?.headers as Headers;
    assert.equal(headers.has('Authorization'), false);
    assert.equal(unauthorizedTriggered, true);
    assert.equal(tokenManager.getToken(), null);
  });

  it('6. Handles network failure with status 0 and code NETWORK_ERROR', async () => {
    mockFetchNetworkError('Connection refused');

    await assert.rejects(
      async () => {
        await httpClient.get('/api/factories');
      },
      (err: unknown) => {
        assert(err instanceof ApiClientError);
        assert.equal(err.status, 0);
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.match(err.message, /Connection refused/);
        return true;
      }
    );
  });

  it('7. Handles timeout failure with status 504 and code REQUEST_TIMEOUT', async () => {
    mockFetchTimeout();

    await assert.rejects(
      async () => {
        await request('/api/factories', { timeoutMs: 50 });
      },
      (err: unknown) => {
        assert(err instanceof ApiClientError);
        assert.equal(err.status, 504);
        assert.equal(err.code, 'REQUEST_TIMEOUT');
        return true;
      }
    );
  });

  it('8. Correctly serializes query parameters (dates, numbers, strings, null filtering)', () => {
    const testDate = new Date('2026-11-19T18:00:00.000Z');
    const qs = buildQueryString({
      factory_id: 'd9b2d63d-a5d6-4e58-9a67-111111111111',
      page: 2,
      page_size: 20,
      active: true,
      start_time: testDate,
      empty: '',
      null_val: null,
      undef_val: undefined,
    });

    assert.equal(
      qs,
      '?factory_id=d9b2d63d-a5d6-4e58-9a67-111111111111&page=2&page_size=20&active=true&start_time=2026-11-19T18%3A00%3A00.000Z'
    );

    assert.equal(buildQueryString(undefined), '');
    assert.equal(buildQueryString({}), '');
  });

  it('9. Typed API services invoke correct endpoints and methods', async () => {
    // 9a: api.auth.login stores token
    mockFetchResponse(200, {
      success: true,
      data: { access_token: 'login-token-xyz', token_type: 'bearer' }
    });
    const loginRes = await api.auth.login({ email: 'user@enerpilot.io', password: 'Password12345!' });
    assert.equal(loginRes.data.access_token, 'login-token-xyz');
    assert.equal(tokenManager.getToken(), 'login-token-xyz');
    assert.equal(lastRequestUrl, `${getApiBaseUrl()}/api/auth/login`);

    // 9b: api.factories.list passes pagination params
    mockFetchResponse(200, {
      success: true,
      data: [{ id: 'fact-1', name: 'Plant 1', location: 'Pune', industry_type: 'Auto', timezone: 'UTC', is_demo: false, created_at: '', updated_at: '' }],
      meta: { page: 1, page_size: 10, total: 1 }
    });
    const factoriesRes = await api.factories.list({ page: 1, page_size: 10 });
    assert.equal(factoriesRes.data.length, 1);
    assert.equal(lastRequestUrl, `${getApiBaseUrl()}/api/factories?page=1&page_size=10`);

    // 9c: api.energy.summary passes query params
    mockFetchResponse(200, {
      success: true,
      data: { total_energy_kwh: 12000, peak_demand_kw: 1120, production_units: 800, energy_per_unit: 15.0, estimated_cost: 96000, estimated_co2_kg: 8640, readings_count: 24, production_records_count: 24 }
    });
    const energyRes = await api.energy.summary({ factory_id: 'fact-1', shift: 'day' });
    assert.equal(energyRes.data.total_energy_kwh, 12000);
    assert.equal(lastRequestUrl, `${getApiBaseUrl()}/api/energy/summary?factory_id=fact-1&shift=day`);

    // 9d: api.optimization.create sends POST with payload
    mockFetchResponse(201, {
      success: true,
      data: { id: 'run-1', status: 'optimal', schedule: [], metrics: { production_units: 1000, energy_kwh: 14000, peak_demand_kw: 980, estimated_cost: 112000 }, explanation: null }
    });
    const optRes = await api.optimization.create({ factory_id: 'fact-1', production_target: 1000, planning_horizon_hours: 24 });
    assert.equal(optRes.data.status, 'optimal');
    assert.equal(lastRequestInit?.method, 'POST');
    assert.equal(lastRequestUrl, `${getApiBaseUrl()}/api/optimization`);

    // 9e: api.copilot.ask sends POST request
    mockFetchResponse(200, {
      success: true,
      data: { answer: 'Peak demand is within limits', citations: [{ source: 'energy_data' }] }
    });
    const copilotRes = await api.copilot.ask({ factory_id: 'fact-1', question: 'What is peak demand?' });
    assert.equal(copilotRes.data.answer, 'Peak demand is within limits');
    assert.equal(lastRequestUrl, `${getApiBaseUrl()}/api/copilot`);
  });
});

describe('Step 4: Authentication & Factory Initialization Tests', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    tokenManager.clearToken();
    tokenManager.onUnauthorized(null);
    lastRequestUrl = '';
    lastRequestInit = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    tokenManager.clearToken();
  });

  it('1. Login flow exchanges credentials, sets Bearer token, and retrieves user profile', async () => {
    // 1a. Login request
    mockFetchResponse(200, {
      success: true,
      data: { access_token: 'auth-jwt-token-step4', token_type: 'bearer' }
    });

    const loginRes = await api.auth.login({
      email: 'engineer@enerpilot.io',
      password: 'EnterprisePassword123!'
    });

    assert.equal(loginRes.data.access_token, 'auth-jwt-token-step4');
    assert.equal(tokenManager.getToken(), 'auth-jwt-token-step4');
    assert.equal(api.auth.isAuthenticated(), true);
    assert.equal(lastRequestInit?.method, 'POST');
    assert.equal(JSON.parse(lastRequestInit?.body as string).email, 'engineer@enerpilot.io');
    assert.equal(JSON.parse(lastRequestInit?.body as string).password, 'EnterprisePassword123!');

    // 1b. Profile retrieval with Bearer token
    mockFetchResponse(200, {
      success: true,
      data: {
        id: 'u-123e4567-e89b-12d3-a456-426614174000',
        email: 'engineer@enerpilot.io',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }
    });

    const meRes = await api.auth.me();
    assert.equal(meRes.data.id, 'u-123e4567-e89b-12d3-a456-426614174000');
    assert.equal(meRes.data.email, 'engineer@enerpilot.io');
    const headers = lastRequestInit?.headers as Headers;
    assert.equal(headers.get('Authorization'), 'Bearer auth-jwt-token-step4');
  });

  it('2. Login failure rejects with 401 ApiClientError and leaves token empty', async () => {
    mockFetchResponse(401, {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
    });

    await assert.rejects(
      async () => {
        await api.auth.login({ email: 'bad@enerpilot.io', password: 'wrong' });
      },
      (err: unknown) => {
        assert(err instanceof ApiClientError);
        assert.equal(err.status, 401);
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        return true;
      }
    );

    assert.equal(tokenManager.getToken(), null);
    assert.equal(api.auth.isAuthenticated(), false);
  });

  it('3. Session restoration via api.auth.me() succeeds when stored token is valid', async () => {
    tokenManager.setToken('restored-jwt-token');

    mockFetchResponse(200, {
      success: true,
      data: {
        id: 'user-pune-admin',
        email: 'pune.lead@enerpilot.io',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }
    });

    const profile = await api.auth.me();
    assert.equal(profile.data.email, 'pune.lead@enerpilot.io');
    assert.equal(lastRequestUrl, `${getApiBaseUrl()}/api/auth/me`);
  });

  it('4. Expired session on api.auth.me() triggers onUnauthorized and clears token', async () => {
    tokenManager.setToken('expired-jwt-token');
    let unauthorizedFired = false;
    tokenManager.onUnauthorized(() => {
      unauthorizedFired = true;
    });

    mockFetchResponse(401, {
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Signature has expired' }
    });

    await assert.rejects(
      async () => {
        await api.auth.me();
      },
      (err: unknown) => {
        assert(err instanceof ApiClientError);
        assert.equal(err.status, 401);
        return true;
      }
    );

    assert.equal(unauthorizedFired, true);
    assert.equal(tokenManager.getToken(), null);
    assert.equal(api.auth.isAuthenticated(), false);
  });

  it('5. Logout cleans up session token immediately', () => {
    tokenManager.setToken('token-to-clear');
    assert.equal(api.auth.isAuthenticated(), true);

    api.auth.logout();

    assert.equal(tokenManager.getToken(), null);
    assert.equal(api.auth.isAuthenticated(), false);
  });

  it('6. Factory initialization retrieves backend UUIDs and preserves pagination metadata', async () => {
    tokenManager.setToken('auth-token');

    const backendFactories = [
      {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        name: 'Pune Automotive Assembly',
        location: 'Pune, Maharashtra',
        industry_type: 'Automotive Manufacturing',
        timezone: 'Asia/Kolkata',
        is_demo: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      },
      {
        id: '2c5b058a-a43a-4efb-8664-8457c1285223',
        name: 'Chennai Precision Press',
        location: 'Chennai, Tamil Nadu',
        industry_type: 'Heavy Engineering',
        timezone: 'Asia/Kolkata',
        is_demo: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }
    ];

    mockFetchResponse(200, {
      success: true,
      data: backendFactories,
      meta: { page: 1, page_size: 50, total: 2 }
    });

    const res = await api.factories.list({ page: 1, page_size: 50 });
    assert.equal(res.data.length, 2);
    assert.equal(res.data[0].id, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    assert.equal(res.data[1].id, '2c5b058a-a43a-4efb-8664-8457c1285223');
    assert.equal(res.meta?.total, 2);
    assert.equal(res.meta?.page, 1);
    assert.equal(lastRequestUrl, `${getApiBaseUrl()}/api/factories?page=1&page_size=50`);
  });

  it('7. Factory list returns empty array cleanly when no facilities exist', async () => {
    tokenManager.setToken('auth-token');

    mockFetchResponse(200, {
      success: true,
      data: [],
      meta: { page: 1, page_size: 50, total: 0 }
    });

    const res = await api.factories.list({ page: 1, page_size: 50 });
    assert.equal(res.data.length, 0);
    assert.equal(res.meta?.total, 0);
  });
});
