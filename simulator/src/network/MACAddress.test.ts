import { describe, it, expect } from 'vitest';
import { MACAddress } from './MACAddress.js';

describe('MACAddress', () => {
  it('should create a valid MAC address', () => {
    const result = MACAddress.create('00:1A:2B:3C:4D:5E');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toString()).toBe('00:1A:2B:3C:4D:5E');
    }
  });

  it('should normalize MAC addresses with hyphens and lowercase', () => {
    const result = MACAddress.create('00-1a-2b-3c-4d-5e');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toString()).toBe('00:1A:2B:3C:4D:5E');
    }
  });

  it('should reject invalid MAC addresses', () => {
    const invalids = [
      '00:1A:2B:3C:4D', // Too short
      '00:1A:2B:3C:4D:5E:6F', // Too long
      '00:1A:2B:3C:4D:5Z', // Invalid chars
      'invalid',
    ];

    for (const invalid of invalids) {
      const result = MACAddress.create(invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_MAC_ADDRESS');
      }
    }
  });

  it('should generate a valid local MAC address', () => {
    const mac = MACAddress.generateLocal();
    const result = MACAddress.create(mac.toString());
    expect(result.ok).toBe(true);

    // Check locally administered bit (second least significant bit of first octet)
    const firstOctet = parseInt(mac.toString().split(':')[0], 16);
    expect(firstOctet & 0b00000010).toBe(0b00000010); // Locally administered bit is 1
    expect(firstOctet & 0b00000001).toBe(0); // Multicast bit is 0
  });

  it('should generate deterministic MAC addresses for testing', () => {
    const mac1 = MACAddress.generateLocalForTesting(0);
    const mac2 = MACAddress.generateLocalForTesting(0);
    const mac3 = MACAddress.generateLocalForTesting(1);

    // Same counter should produce same MAC
    expect(mac1.toString()).toBe(mac2.toString());

    // Different counters should produce different MACs
    expect(mac1.toString()).not.toBe(mac3.toString());

    // All should be valid MAC addresses
    expect(MACAddress.create(mac1.toString()).ok).toBe(true);
    expect(MACAddress.create(mac3.toString()).ok).toBe(true);

    // Check locally administered bit
    const firstOctet1 = parseInt(mac1.toString().split(':')[0], 16);
    const firstOctet3 = parseInt(mac3.toString().split(':')[0], 16);
    expect(firstOctet1 & 0b00000010).toBe(0b00000010);
    expect(firstOctet3 & 0b00000010).toBe(0b00000010);
  });

  it('should generate unique MAC addresses for sequential counters', () => {
    const macs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const mac = MACAddress.generateLocalForTesting(i);
      macs.add(mac.toString());
    }
    // All 100 MACs should be unique
    expect(macs.size).toBe(100);
  });
});
