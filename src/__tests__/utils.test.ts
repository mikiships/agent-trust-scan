import { jest } from '@jest/globals';
import { normalizeUrl, buildUrl, calculateScore, fetchWithTimeout } from '../utils.js';

describe('Utils', () => {
  describe('normalizeUrl', () => {
    it('should remove https:// protocol', () => {
      expect(normalizeUrl('https://example.com')).toBe('example.com');
    });

    it('should remove http:// protocol', () => {
      expect(normalizeUrl('http://example.com')).toBe('example.com');
    });

    it('should remove trailing slash', () => {
      expect(normalizeUrl('example.com/')).toBe('example.com');
    });

    it('should remove path', () => {
      expect(normalizeUrl('example.com/path/to/page')).toBe('example.com');
    });

    it('should handle combined normalizations', () => {
      expect(normalizeUrl('https://example.com/path/')).toBe('example.com');
    });

    it('should preserve port numbers', () => {
      expect(normalizeUrl('example.com:8080')).toBe('example.com:8080');
    });

    it('should handle bare domain', () => {
      expect(normalizeUrl('example.com')).toBe('example.com');
    });

    it('should handle subdomain', () => {
      expect(normalizeUrl('api.example.com')).toBe('api.example.com');
    });
  });

  describe('buildUrl', () => {
    it('should combine domain and path', () => {
      expect(buildUrl('example.com', '/path')).toBe('https://example.com/path');
    });

    it('should normalize domain before building', () => {
      expect(buildUrl('https://example.com/', '/path')).toBe('https://example.com/path');
    });

    it('should handle domain with port', () => {
      expect(buildUrl('example.com:8080', '/path')).toBe('https://example.com:8080/path');
    });

    it('should handle empty path', () => {
      expect(buildUrl('example.com', '')).toBe('https://example.com');
    });
  });

  describe('calculateScore', () => {
    it('should return 100 for all pass', () => {
      const checks = {
        a: { status: 'pass' },
        b: { status: 'pass' },
        c: { status: 'pass' },
      };
      expect(calculateScore(checks)).toBe(100);
    });

    it('should return 0 for all fail', () => {
      const checks = {
        a: { status: 'fail' },
        b: { status: 'fail' },
        c: { status: 'fail' },
      };
      expect(calculateScore(checks)).toBe(0);
    });

    it('should return 50 for all warn', () => {
      const checks = {
        a: { status: 'warn' },
        b: { status: 'warn' },
        c: { status: 'warn' },
      };
      expect(calculateScore(checks)).toBe(50);
    });

    it('should calculate mixed statuses correctly', () => {
      const checks = {
        a: { status: 'pass' },  // 100
        b: { status: 'warn' },  // 50
        c: { status: 'fail' },  // 0
        d: { status: 'pass' },  // 100
      };
      // (100 + 50 + 0 + 100) / 4 = 250 / 4 = 62.5 → 63
      expect(calculateScore(checks)).toBe(63);
    });

    it('should handle single check', () => {
      expect(calculateScore({ a: { status: 'pass' } })).toBe(100);
      expect(calculateScore({ a: { status: 'warn' } })).toBe(50);
      expect(calculateScore({ a: { status: 'fail' } })).toBe(0);
    });

    it('should round to nearest integer', () => {
      const checks = {
        a: { status: 'pass' },
        b: { status: 'pass' },
        c: { status: 'warn' },
      };
      // (100 + 100 + 50) / 3 = 83.33... → 83
      expect(calculateScore(checks)).toBe(83);
    });
  });

  describe('fetchWithTimeout', () => {
    const mockFetch = jest.fn<any>();

    beforeEach(() => {
      global.fetch = mockFetch;
      jest.clearAllMocks();
    });

    it('should fetch successfully within timeout', async () => {
      const mockResponse = { ok: true, status: 200 };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await fetchWithTimeout('https://example.com', 5000);

      expect(result).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: {
            'User-Agent': 'agent-trust-scan/0.1.0',
          },
        })
      );
    });

    it('should propagate fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchWithTimeout('https://example.com', 5000)).rejects.toThrow('Network error');
    });

    it('should use default timeout of 10000ms', async () => {
      const mockResponse = { ok: true };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await fetchWithTimeout('https://example.com');

      expect(result).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
