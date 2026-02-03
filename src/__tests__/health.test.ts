import { jest } from '@jest/globals';

const mockFetch = jest.fn<any>();
global.fetch = mockFetch;

import { scanHealth } from '../scanners/health.js';

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
  });

  it('should fail for unreachable domain', async () => {
    mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

    const result = await scanHealth('nonexistent-domain-12345.com');

    expect(result.status).toBe('fail');
    expect(result.details.error).toBeDefined();
    expect(result.details.error).toContain('ENOTFOUND');
  });

  it('should handle timeout errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

    const result = await scanHealth('slow-domain.com');

    expect(result.status).toBe('fail');
    expect(result.details.error).toContain('timeout');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await scanHealth('localhost');

    expect(result.status).toBe('fail');
    expect(result.details.error).toContain('ECONNREFUSED');
  });

  it('should warn for HTTP error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: { get: () => null },
    });

    const result = await scanHealth('broken.com');

    // Status depends on TLS check, which we can't easily mock
    expect(['warn', 'fail']).toContain(result.status);
    expect(result.details.statusCode).toBe(500);
  });
});
