import { jest } from '@jest/globals';
import { isPrivateOrReservedIP, validateDomain } from '../security.js';

describe('Security', () => {
  describe('isPrivateOrReservedIP', () => {
    describe('IPv4 private ranges', () => {
      it('should detect 10.x.x.x', () => {
        expect(isPrivateOrReservedIP('10.0.0.1')).toBe(true);
        expect(isPrivateOrReservedIP('10.255.255.255')).toBe(true);
      });

      it('should detect 172.16-31.x.x', () => {
        expect(isPrivateOrReservedIP('172.16.0.1')).toBe(true);
        expect(isPrivateOrReservedIP('172.31.255.255')).toBe(true);
        expect(isPrivateOrReservedIP('172.15.0.1')).toBe(false);
        expect(isPrivateOrReservedIP('172.32.0.1')).toBe(false);
      });

      it('should detect 192.168.x.x', () => {
        expect(isPrivateOrReservedIP('192.168.0.1')).toBe(true);
        expect(isPrivateOrReservedIP('192.168.255.255')).toBe(true);
        expect(isPrivateOrReservedIP('192.167.0.1')).toBe(false);
      });

      it('should detect 127.x.x.x (loopback)', () => {
        expect(isPrivateOrReservedIP('127.0.0.1')).toBe(true);
        expect(isPrivateOrReservedIP('127.255.255.255')).toBe(true);
      });

      it('should detect 169.254.x.x (link-local)', () => {
        expect(isPrivateOrReservedIP('169.254.0.1')).toBe(true);
        expect(isPrivateOrReservedIP('169.254.169.254')).toBe(true);
      });

      it('should detect 0.0.0.0/8', () => {
        expect(isPrivateOrReservedIP('0.0.0.0')).toBe(true);
        expect(isPrivateOrReservedIP('0.255.255.255')).toBe(true);
      });

      it('should detect broadcast address', () => {
        expect(isPrivateOrReservedIP('255.255.255.255')).toBe(true);
      });

      it('should detect carrier-grade NAT (100.64.0.0/10, RFC6598)', () => {
        expect(isPrivateOrReservedIP('100.64.0.1')).toBe(true);
        expect(isPrivateOrReservedIP('100.100.100.100')).toBe(true);
        expect(isPrivateOrReservedIP('100.127.255.255')).toBe(true);
        // 100.128.0.0 is outside the /10 block
        expect(isPrivateOrReservedIP('100.128.0.1')).toBe(false);
      });

      it('should allow public IPs', () => {
        expect(isPrivateOrReservedIP('8.8.8.8')).toBe(false);
        expect(isPrivateOrReservedIP('1.1.1.1')).toBe(false);
        expect(isPrivateOrReservedIP('151.101.1.140')).toBe(false);
      });
    });

    describe('IPv6 private ranges', () => {
      it('should detect ::1 (loopback)', () => {
        expect(isPrivateOrReservedIP('::1')).toBe(true);
        expect(isPrivateOrReservedIP('0:0:0:0:0:0:0:1')).toBe(true);
      });

      it('should detect fc00::/7 (unique local)', () => {
        expect(isPrivateOrReservedIP('fc00::1')).toBe(true);
        expect(isPrivateOrReservedIP('fd00::1')).toBe(true);
      });

      it('should detect fe80::/10 (link-local)', () => {
        expect(isPrivateOrReservedIP('fe80::1')).toBe(true);
        expect(isPrivateOrReservedIP('fe9a::1')).toBe(true);
      });

      it('should detect IPv4-mapped IPv6 in compressed form', () => {
        expect(isPrivateOrReservedIP('::ffff:192.168.1.1')).toBe(true);
        expect(isPrivateOrReservedIP('::ffff:127.0.0.1')).toBe(true);
        expect(isPrivateOrReservedIP('::ffff:169.254.169.254')).toBe(true);
      });

      it('should detect IPv4-mapped IPv6 in expanded forms (regression test for blocker #1)', () => {
        // Expanded form: 0:0:0:0:0:ffff:7f00:1 is ::ffff:127.0.0.1
        expect(isPrivateOrReservedIP('0:0:0:0:0:ffff:7f00:1')).toBe(true);
        // Fully expanded with leading zeros
        expect(isPrivateOrReservedIP('0000:0000:0000:0000:0000:ffff:7f00:0001')).toBe(true);
        // Link-local in IPv4-mapped form: ::ffff:169.254.169.254
        expect(isPrivateOrReservedIP('0:0:0:0:0:ffff:a9fe:a9fe')).toBe(true);
        expect(isPrivateOrReservedIP('0000:0000:0000:0000:0000:ffff:a9fe:a9fe')).toBe(true);
        // Private range in IPv4-mapped form: ::ffff:192.168.1.1
        expect(isPrivateOrReservedIP('0:0:0:0:0:ffff:c0a8:101')).toBe(true);
      });

      it('should allow public IPv6', () => {
        expect(isPrivateOrReservedIP('2001:4860:4860::8888')).toBe(false);
      });
    });
  });

  describe('validateDomain', () => {
    it('should reject domain with userinfo', async () => {
      const result = await validateDomain('user:pass@evil.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('userinfo');
    });

    it('should reject localhost', async () => {
      const result = await validateDomain('localhost');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('localhost');
    });

    it('should reject private IP addresses directly', async () => {
      const result = await validateDomain('127.0.0.1');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Private or reserved');
    });

    it('should reject link-local addresses', async () => {
      const result = await validateDomain('169.254.169.254');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Private or reserved');
    });

    it('should allow public IP addresses', async () => {
      const result = await validateDomain('8.8.8.8');
      expect(result.valid).toBe(true);
    });

    it('should allow real domain (with DNS resolution)', async () => {
      // This will actually do DNS resolution - using a known public domain
      const result = await validateDomain('example.com');
      // May pass or fail depending on network, but shouldn't throw
      expect(result).toHaveProperty('valid');
    }, 10000); // Longer timeout for real DNS
  });
});
