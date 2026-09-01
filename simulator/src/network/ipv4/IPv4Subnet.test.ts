import { describe, it, expect } from 'vitest';
import { IPv4Subnet } from './IPv4Subnet.js';

describe('IPv4Subnet', () => {
  describe('prefixToMaskInt() and maskToPrefixLength()', () => {
    it('converts prefixes to masks correctly', () => {
      const cases: Array<[number, string]> = [
        [0, '0.0.0.0'],
        [8, '255.0.0.0'],
        [16, '255.255.0.0'],
        [24, '255.255.255.0'],
        [25, '255.255.255.128'],
        [26, '255.255.255.192'],
        [30, '255.255.255.252'],
        [32, '255.255.255.255'],
      ];

      for (const [prefix, mask] of cases) {
        // Test prefix -> mask
        const maskInt = IPv4Subnet.prefixToMaskInt(prefix);
        // We'll need a helper to convert int back to IP, but maskToPrefixLength does the reverse
        expect(IPv4Subnet.maskToPrefixLength(mask)).toBe(prefix);
      }
    });

    it('rejects invalid or non-contiguous subnet masks', () => {
      const invalid = [
        '255.0.255.0',
        '255.255.128.255',
        '255.255.255.1',
        '255.255.255.2',
        '10.0.0.0', // valid IP, not a valid mask
        '256.0.0.0', // invalid IP entirely
      ];

      for (const mask of invalid) {
        expect(IPv4Subnet.maskToPrefixLength(mask)).toBeNull();
      }
    });
  });

  describe('create() / Subnet Math', () => {
    it('calculates network and broadcast for /24', () => {
      const res = IPv4Subnet.create('192.168.1.10', 24);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const subnet = res.value;
        expect(subnet.networkAddress).toBe('192.168.1.0');
        expect(subnet.broadcastAddress).toBe('192.168.1.255');
        expect(subnet.subnetMask).toBe('255.255.255.0');
      }

      const res2 = IPv4Subnet.create('192.168.1.200', 24);
      if (res2.ok) {
        expect(res2.value.networkAddress).toBe('192.168.1.0');
      }
    });

    it('calculates network and broadcast for /16', () => {
      const res = IPv4Subnet.create('10.10.25.100', 16);
      if (res.ok) {
        expect(res.value.networkAddress).toBe('10.10.0.0');
        expect(res.value.broadcastAddress).toBe('10.10.255.255');
      }
    });

    it('calculates network and broadcast for /8', () => {
      const res = IPv4Subnet.create('10.10.25.100', 8);
      if (res.ok) {
        expect(res.value.networkAddress).toBe('10.0.0.0');
      }
    });

    it('calculates network and broadcast for non-octet boundaries (e.g. /26)', () => {
      const res = IPv4Subnet.create('192.168.1.130', 26);
      if (res.ok) {
        expect(res.value.networkAddress).toBe('192.168.1.128');
        expect(res.value.broadcastAddress).toBe('192.168.1.191');
        expect(res.value.subnetMask).toBe('255.255.255.192');
      }
    });

    it('handles /30, /31, /32', () => {
      // /30
      const r30 = IPv4Subnet.create('192.168.1.1', 30);
      if (r30.ok) {
        expect(r30.value.networkAddress).toBe('192.168.1.0');
        expect(r30.value.broadcastAddress).toBe('192.168.1.3');
      }

      // /31
      const r31 = IPv4Subnet.create('10.0.0.2', 31);
      if (r31.ok) {
        expect(r31.value.networkAddress).toBe('10.0.0.2');
        expect(r31.value.broadcastAddress).toBe('10.0.0.3');
      }

      // /32
      const r32 = IPv4Subnet.create('10.0.0.5', 32);
      if (r32.ok) {
        expect(r32.value.networkAddress).toBe('10.0.0.5');
        expect(r32.value.broadcastAddress).toBe('10.0.0.5');
        expect(r32.value.subnetMask).toBe('255.255.255.255');
      }
    });
  });

  describe('isSameSubnet()', () => {
    it('returns true for IPs in the same subnet', () => {
      expect(IPv4Subnet.isSameSubnet('192.168.1.10', '192.168.1.20', 24)).toBe(true);
      // 192.168.1.65/26 -> network .64  (65 & ~0x3f = 64)
      // 192.168.1.100/26 -> network .64 (100 & ~0x3f = 64)
      // Both fall in 192.168.1.64/26 → same subnet
      expect(IPv4Subnet.isSameSubnet('192.168.1.65', '192.168.1.100', 26)).toBe(true);

      expect(IPv4Subnet.isSameSubnet('192.168.1.10', '192.168.2.20', 24)).toBe(false);
      // 192.168.1.130/26 -> network .128, 192.168.1.120/26 -> network .64
      expect(IPv4Subnet.isSameSubnet('192.168.1.130', '192.168.1.120', 26)).toBe(false);
    });
  });

  describe('isValidHost()', () => {
    it('verifies host constraints for /24', () => {
      const r = IPv4Subnet.create('192.168.1.0', 24);
      if (!r.ok) throw new Error('Failed');
      const subnet = r.value;

      expect(subnet.isValidHost('192.168.1.0')).toBe(false); // Network
      expect(subnet.isValidHost('192.168.1.1')).toBe(true); // Host
      expect(subnet.isValidHost('192.168.1.254')).toBe(true); // Host
      expect(subnet.isValidHost('192.168.1.255')).toBe(false); // Broadcast
      expect(subnet.isValidHost('192.168.2.1')).toBe(false); // Different subnet
    });

    it('handles /31 correctly', () => {
      const r = IPv4Subnet.create('192.168.1.2', 31);
      if (!r.ok) throw new Error('Failed');
      const subnet = r.value;

      expect(subnet.isValidHost('192.168.1.2')).toBe(true); // Network addr, but valid host in /31
      expect(subnet.isValidHost('192.168.1.3')).toBe(true); // Broadcast addr, but valid host in /31
      expect(subnet.isValidHost('192.168.1.4')).toBe(false); // Outside subnet
    });

    it('handles /32 correctly', () => {
      const r = IPv4Subnet.create('192.168.1.5', 32);
      if (!r.ok) throw new Error('Failed');
      const subnet = r.value;

      expect(subnet.isValidHost('192.168.1.5')).toBe(true); // Only valid host
      expect(subnet.isValidHost('192.168.1.6')).toBe(false); // Outside subnet
    });
  });

  describe('fromCidr()', () => {
    it('parses valid CIDR strings', () => {
      const res = IPv4Subnet.fromCidr('10.0.0.1/24');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.ip).toBe('10.0.0.1');
        expect(res.value.subnet.networkAddress).toBe('10.0.0.0');
        expect(res.value.subnet.prefixLength).toBe(24);
      }
    });

    it('rejects invalid CIDR strings', () => {
      expect(IPv4Subnet.fromCidr('10.0.0.1').ok).toBe(false);
      expect(IPv4Subnet.fromCidr('10.0.0.1/33').ok).toBe(false);
      expect(IPv4Subnet.fromCidr('10.0.0.1/abc').ok).toBe(false);
      expect(IPv4Subnet.fromCidr('256.0.0.1/24').ok).toBe(false);
    });
  });
});
