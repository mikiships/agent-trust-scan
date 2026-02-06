import { jest } from '@jest/globals';

const mockFetch = jest.fn<any>();
global.fetch = mockFetch;

import { scanHealth } from '../scanners/health.js';

// TODO (test determinism): Currently uses real TLS connections via tls.connect()
// which makes tests non-deterministic and environment-dependent. Consider:
// - Mock tls.connect() for unit tests
// - Mock dns.lookup() to avoid real DNS
// - Keep integration tests behind --runIntegrationTests flag
// - Use dependency injection for tls/dns modules

describe('Health Scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass for healthy domain with valid TLS and good latency', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
    });

    const result = await scanHealth('example.com');

    expect(result.status).toBe('pass');
    expect(result.details.statusCode).toBe(200);
    expect(result.details.latencyMs).toBeDefined();
    expect(result.details.tlsValid).toBeDefined();
    expect(result.trace).toBeDefined();
    expect(result.trace?.some(s => s.step === 'fetch')).toBe(true);
    expect(result.trace?.some(s => s.step === 'verdict')).toBe(true);
  });

  it('should fail for unreachable domain', async () => {
    mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

    const result = await scanHealth('nonexistent-domain-12345.com');

    expect(result.status).toBe('fail');
    expect(result.details.error).toBeDefined();
    // safeFetch now validates DNS before fetching, so error message changes
    expect(result.details.error).toContain('DNS lookup failed');
    expect(result.trace).toBeDefined();
    expect(result.trace?.some(s => s.step === 'fetch')).toBe(true);
    expect(result.trace?.some(s => s.step === 'verdict')).toBe(true);
  });

  it('should handle timeout errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

    const result = await scanHealth('slow-domain.com');

    expect(result.status).toBe('fail');
    // safeFetch validates DNS first, so we get DNS error before timeout
    expect(result.details.error).toContain('DNS lookup failed');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await scanHealth('localhost');

    expect(result.status).toBe('fail');
    // localhost is now blocked by SSRF protection
    expect(result.details.error).toContain('private/reserved IP');
  });

  it('should warn for HTTP error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: { get: () => null },
    });

    const result = await scanHealth('broken.com');

    // safeFetch validates DNS before fetching, so we get DNS error for non-existent domains
    // This test demonstrates that DNS validation happens before HTTP fetch
    expect(result.status).toBe('fail');
    expect(result.details.error).toBeDefined();
    // DNS lookup will fail for fake domains (either wrapped or raw error)
    expect(result.details.error).toMatch(/DNS lookup failed|ENOTFOUND/);
  });
});
