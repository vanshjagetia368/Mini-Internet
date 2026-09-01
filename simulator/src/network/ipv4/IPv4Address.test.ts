import { describe, it, expect } from 'vitest';
import { IPv4Address } from './IPv4Address.js';

describe('IPv4Address', () => {
  describe('isValid()', () => {
    it('accepts valid IP addresses', () => {
      const valid = [
        '0.0.0.0',
        '1.1.1.1',
        '10.0.0.1',
        '127.0.0.1',
        '172.16.0.1',
        '192.168.1.1',
        '255.255.255.255',
      ];
      for (const ip of valid) {
        expect(IPv4Address.isValid(ip), `Expected ${ip} to be valid`).toBe(true);
      }
    });

    it('rejects invalid IP addresses', () => {
      const invalid = [
        '256.0.0.1',
        '192.168.1',
        '192.168.1.1.1',
        '-1.0.0.1',
        'abc.1.1.1',
        '1.1.1.',
        '1..1.1',
        '192.168.01.1', // leading zeros are rejected
        '01.1.1.1',
      ];
      for (const ip of invalid) {
        expect(IPv4Address.isValid(ip), `Expected ${ip} to be invalid`).toBe(false);
      }
    });
  });

  describe('create()', () => {
    it('creates a valid IPv4Address instance', () => {
      const result = IPv4Address.create('192.168.1.1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.toString()).toBe('192.168.1.1');
      }
    });

    it('returns error for invalid IP', () => {
      const result = IPv4Address.create('999.999.999.999');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_IPV4_ADDRESS');
      }
    });
  });

  describe('isValidPrefix()', () => {
    it('accepts valid prefixes 0-32', () => {
      const valid = [0, 1, 8, 16, 24, 30, 31, 32];
      for (const p of valid) {
        expect(IPv4Address.isValidPrefix(p)).toBe(true);
      }
    });

    it('rejects invalid prefixes', () => {
      const invalid = [-1, 33, 100, NaN, 24.5];
      for (const p of invalid) {
        expect(IPv4Address.isValidPrefix(p)).toBe(false);
      }
    });
  });

  describe('toUint32() and intToIp()', () => {
    it('converts to uint32 and back correctly', () => {
      const ips = ['0.0.0.0', '192.168.1.1', '10.0.0.1', '255.255.255.255'];
      for (const ip of ips) {
        const num = IPv4Address.ipToInt(ip);
        const back = IPv4Address.intToIp(num);
        expect(back).toBe(ip);
      }
    });

    it('handles 255.255.255.255 without signed integer overflow', () => {
      const num = IPv4Address.ipToInt('255.255.255.255');
      expect(num).toBeGreaterThan(0); // Should be unsigned
      expect(num).toBe(4294967295);
    });
  });
});
