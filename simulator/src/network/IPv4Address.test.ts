import { describe, it, expect } from 'vitest';
import { IPv4Address } from './IPv4Address.js';

describe('IPv4Address', () => {
  describe('create and isValid', () => {
    it('should create valid IPv4 addresses', () => {
      const valids = ['192.168.1.1', '10.0.0.0', '255.255.255.255', '0.0.0.0'];
      
      for (const ip of valids) {
        const result = IPv4Address.create(ip);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.toString()).toBe(ip);
        }
      }
    });

    it('should reject invalid IPv4 addresses', () => {
      const invalids = [
        '256.0.0.1',      // octet > 255
        '192.168.1',      // too short
        '192.168.1.1.1',  // too long
        '-1.0.0.0',       // negative
        '192.168.1.a',    // invalid char
        'invalid',
      ];

      for (const invalid of invalids) {
        const result = IPv4Address.create(invalid);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('INVALID_IPV4_ADDRESS');
        }
      }
    });
  });

  describe('isValidPrefix', () => {
    it('should accept valid prefixes', () => {
      expect(IPv4Address.isValidPrefix(0)).toBe(true);
      expect(IPv4Address.isValidPrefix(24)).toBe(true);
      expect(IPv4Address.isValidPrefix(32)).toBe(true);
    });

    it('should reject invalid prefixes', () => {
      expect(IPv4Address.isValidPrefix(-1)).toBe(false);
      expect(IPv4Address.isValidPrefix(33)).toBe(false);
      expect(IPv4Address.isValidPrefix(24.5)).toBe(false);
    });
  });
});
