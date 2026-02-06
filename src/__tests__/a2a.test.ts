import { jest } from '@jest/globals';

const mockFetch = jest.fn<any>();
global.fetch = mockFetch;

import { scanA2AAgentCard } from '../scanners/a2a.js';

describe('A2A Agent Card Scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return warn status when agent.json is not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await scanA2AAgentCard('example.com');
    expect(result.status).toBe('warn');
    expect(result.details.exists).toBe(false);
    expect(result.trace).toBeDefined();
    expect(result.trace?.some(s => s.step === 'fetch')).toBe(true);
    expect(result.trace?.some(s => s.step === 'verdict')).toBe(true);
  });

  it('should return pass status for valid agent card', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
      json: async () => ({
        name: 'Test Agent',
        url: 'https://example.com',
        version: '1.0.0',
        skills: [{ id: 'skill1', name: 'Test Skill', description: 'A test skill' }],
      }),
    });

    const result = await scanA2AAgentCard('example.com');
    expect(result.status).toBe('pass');
    expect(result.details.schemaValid).toBe(true);
    expect(result.details.name).toBe('Test Agent');
    expect(result.trace).toBeDefined();
    expect(result.trace?.some(s => s.step === 'schema_validate')).toBe(true);
    expect(result.trace?.some(s => s.step === 'verdict')).toBe(true);
  });

  it('should return fail status for invalid schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
      json: async () => ({ name: 'Test Agent' }),
    });

    const result = await scanA2AAgentCard('example.com');
    expect(result.status).toBe('fail');
    expect(result.details.schemaValid).toBe(false);
    expect(result.trace).toBeDefined();
    expect(result.trace?.some(s => s.step === 'schema_validate')).toBe(true);
    expect(result.trace?.some(s => s.step === 'verdict')).toBe(true);
  });

  it('should return warn status for SPA catch-all returning HTML', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'text/html; charset=utf-8' : null },
    });

    const result = await scanA2AAgentCard('example.com');
    expect(result.status).toBe('warn');
    expect(result.details.exists).toBe(false);
    expect(result.details.message).toContain('SPA catch-all');
    expect(result.trace).toBeDefined();
    expect(result.trace?.some(s => s.step === 'fetch')).toBe(true);
    expect(result.trace?.some(s => s.step === 'verdict')).toBe(true);
  });
});
