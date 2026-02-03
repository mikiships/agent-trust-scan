import { jest } from '@jest/globals';

const mockFetch = jest.fn<any>();
global.fetch = mockFetch;

import { scanLlmsTxt } from '../scanners/llms-txt.js';

describe('llms.txt Scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return warn status when llms.txt is not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await scanLlmsTxt('example.com');
    expect(result.status).toBe('warn');
    expect(result.details.exists).toBe(false);
  });

  it('should return pass status for valid llms.txt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => `# Example Site\n\n> Description\n\n## Docs\n- [API](https://example.com/api)\n`,
    });
    // Mock link check
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null } });

    const result = await scanLlmsTxt('example.com');
    if (result.status !== 'pass') {
      console.error('Result:', JSON.stringify(result, null, 2));
    }
    expect(result.status).toBe('pass');
    expect(result.details.formatValid).toBe(true);
  });

  it('should return fail for invalid format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => `This has no title heading\nJust plain text`,
    });

    const result = await scanLlmsTxt('example.com');
    if (result.status !== 'fail' || result.details.formatValid !== false) {
      console.error('Result:', JSON.stringify(result, null, 2));
    }
    expect(result.status).toBe('fail');
    expect(result.details.formatValid).toBe(false);
  });
});
