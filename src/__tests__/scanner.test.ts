import { jest } from '@jest/globals';

const mockFetch = jest.fn<any>();
global.fetch = mockFetch;

import { scanDomain } from '../scanner.js';

describe('Domain Scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should scan a domain and return a report with all checks', async () => {
    // Mock all fetch calls for different endpoints
    const validA2A = {
      name: 'Test Agent',
      url: 'https://example.com',
      version: '1.0.0',
      skills: [],
    };

    // Setup mocks for all scanner requests
    mockFetch
      // A2A check
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
        json: async () => validA2A,
      })
      // llms.txt check
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => '# Test\n\nContent',
      })
      // Health check
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
      })
      // MCP check (first path)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      // MCP check (second path)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const result = await scanDomain('example.com');

    expect(result).toHaveProperty('domain', 'example.com');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('summary');
    expect(result.checks).toHaveProperty('a2a_agent_card');
    expect(result.checks).toHaveProperty('llms_txt');
    expect(result.checks).toHaveProperty('health');
    expect(result.checks).toHaveProperty('mcp');
  });

  it('should calculate score correctly', async () => {
    // Mock for all pass scenario
    const validA2A = {
      name: 'Test Agent',
      url: 'https://example.com',
      version: '1.0.0',
      skills: [],
    };

    const validMCP = {
      name: 'Test MCP',
      version: '1.0.0',
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
        json: async () => validA2A,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => '# Test\n\nContent',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
        json: async () => validMCP,
      });

    const result = await scanDomain('example.com');

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.summary).toContain('checks passed');
  });

  it('should reject private IP addresses', async () => {
    await expect(scanDomain('127.0.0.1')).rejects.toThrow('Invalid domain');
  });

  it('should reject domains with userinfo', async () => {
    await expect(scanDomain('user:pass@evil.com')).rejects.toThrow('Invalid domain');
  });

  it('should reject localhost', async () => {
    await expect(scanDomain('localhost')).rejects.toThrow('Invalid domain');
  });
});
