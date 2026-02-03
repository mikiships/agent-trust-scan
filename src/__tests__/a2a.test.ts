import { jest } from '@jest/globals';

// Mock fetch before importing the scanner
global.fetch = jest.fn() as any;

import { scanA2AAgentCard } from '../scanners/a2a.js';

describe('A2A Agent Card Scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return warn status when agent.json is not found', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await scanA2AAgentCard('example.com');
    
    expect(result.status).toBe('warn');
    expect(result.details.exists).toBe(false);
  });

  it('should return pass status for valid agent card', async () => {
    const validCard = {
      name: 'Test Agent',
      url: 'https://example.com',
      version: '1.0.0',
      skills: [
        {
          id: 'skill1',
          name: 'Test Skill',
          description: 'A test skill',
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => name === 'content-type' ? 'application/json' : null,
      },
      json: async () => validCard,
    });

    const result = await scanA2AAgentCard('example.com');
    
    expect(result.status).toBe('pass');
    expect(result.details.schemaValid).toBe(true);
    expect(result.details.name).toBe('Test Agent');
    expect(result.details.skillsCount).toBe(1);
  });

  it('should return fail status for invalid schema', async () => {
    const invalidCard = {
      name: 'Test Agent',
      // Missing required fields: url, version, skills
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => name === 'content-type' ? 'application/json' : null,
      },
      json: async () => invalidCard,
    });

    const result = await scanA2AAgentCard('example.com');
    
    expect(result.status).toBe('fail');
    expect(result.details.schemaValid).toBe(false);
    expect(result.details.errors).toBeDefined();
  });

  it('should calculate completeness score correctly', async () => {
    const completeCard = {
      name: 'Test Agent',
      url: 'https://example.com',
      version: '1.0.0',
      protocol_version: '1.0',
      description: 'A test agent',
      provider: {
        organization: 'Test Org',
        url: 'https://testorg.com',
      },
      capabilities: {
        streaming: true,
        pushNotifications: false,
      },
      authentication: {
        schemes: ['bearer'],
        credentials: 'api_key',
      },
      skills: [{ id: 'skill1', name: 'Skill 1' }],
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => name === 'content-type' ? 'application/json' : null,
      },
      json: async () => completeCard,
    });

    const result = await scanA2AAgentCard('example.com');
    
    expect(result.status).toBe('pass');
    expect(result.details.completeness).toBe(100);
  });
});
