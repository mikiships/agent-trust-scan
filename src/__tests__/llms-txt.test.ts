import { jest } from '@jest/globals';

// Mock fetch before importing the scanner
global.fetch = jest.fn() as any;

import { scanLlmsTxt } from '../scanners/llms-txt.js';

describe('llms.txt Scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return warn status when llms.txt is not found', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await scanLlmsTxt('example.com');
    
    expect(result.status).toBe('warn');
    expect(result.details.exists).toBe(false);
  });

  it('should return pass status for valid llms.txt with reachable links', async () => {
    const validContent = `# Example Site

> This is an optional blockquote

## Documentation
- [Getting Started](https://example.com/docs)
- [API Reference](https://example.com/api)
`;

    // Mock the main llms.txt fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => validContent,
    });

    // Mock link checks
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await scanLlmsTxt('example.com');
    
    expect(result.status).toBe('pass');
    expect(result.details.formatValid).toBe(true);
    expect(result.details.linkCount).toBe(2);
  });

  it('should return fail status for invalid format (missing title)', async () => {
    const invalidContent = `This is not a valid llms.txt - no title!

Some content here.
`;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => invalidContent,
    });

    const result = await scanLlmsTxt('example.com');
    
    expect(result.status).toBe('fail');
    expect(result.details.formatValid).toBe(false);
    expect(result.details.errors).toContain('First line must be a title (starting with #)');
  });

  it('should return warn status when links are broken', async () => {
    const validContent = `# Example Site

- [Working Link](https://example.com/working)
- [Broken Link](https://example.com/broken)
`;

    // Mock the main llms.txt fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => validContent,
    });

    // Mock link checks - first succeeds, second fails
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await scanLlmsTxt('example.com');
    
    expect(result.status).toBe('warn');
    expect(result.details.formatValid).toBe(true);
    expect(result.details.brokenLinks).toHaveLength(1);
  });
});
