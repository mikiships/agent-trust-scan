import { jest } from '@jest/globals';

const mockFetch = jest.fn<any>();
global.fetch = mockFetch;

import { scanMCP } from '../scanners/mcp.js';

describe('MCP Scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass for valid MCP metadata at /.well-known/mcp.json', async () => {
    const validMCP = {
      name: 'Test Server',
      version: '1.0.0',
      tools: [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
      json: async () => validMCP,
    });

    const result = await scanMCP('example.com');

    expect(result.status).toBe('pass');
    expect(result.details.mcpDetected).toBe(true);
    expect(result.details.schemaValid).toBe(true);
    expect(result.details.toolsCount).toBe(1);
  });

  it('should try fallback path when first path returns 404', async () => {
    const validMCP = {
      name: 'Test Server',
      version: '1.0.0',
      tools: [],
    };

    // First path 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second path success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
      json: async () => validMCP,
    });

    const result = await scanMCP('example.com');

    expect(result.status).toBe('pass');
    expect(result.details.mcpDetected).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should try second path even when first has schema validation error', async () => {
    const invalidMCP = { invalid: 'data' }; // Missing required name field
    const validMCP = {
      name: 'Test Server',
      version: '1.0.0',
      tools: [],
    };

    // First path with invalid schema
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
      json: async () => invalidMCP,
    });

    // Second path with valid schema
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
      json: async () => validMCP,
    });

    const result = await scanMCP('example.com');

    expect(result.status).toBe('pass');
    expect(result.details.schemaValid).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should warn when MCP metadata found but schema invalid', async () => {
    const invalidMCP = { version: '1.0.0' }; // Missing required name

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
        json: async () => invalidMCP,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const result = await scanMCP('example.com');

    expect(result.status).toBe('warn');
    expect(result.details.mcpDetected).toBe(true);
    expect(result.details.schemaValid).toBe(false);
    expect(result.details.errors).toBeDefined();
  });

  it('should warn when no MCP endpoint found', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const result = await scanMCP('example.com');

    expect(result.status).toBe('warn');
    expect(result.details.mcpDetected).toBe(false);
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await scanMCP('example.com');

    expect(result.status).toBe('warn');
    expect(result.details.mcpDetected).toBe(false);
  });

  it('should skip non-JSON content-type', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'content-type' ? 'text/html' : null },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const result = await scanMCP('example.com');

    expect(result.status).toBe('warn');
    expect(result.details.mcpDetected).toBe(false);
  });
});
