/**
 * @file simulator/src/network/MACAddress.ts
 *
 * Domain model for MAC addresses.
 * Provides validation and normalization.
 */

import { type Result, err, ok } from '../types/errors.js';

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

export class MACAddress {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Creates a MACAddress if the string is valid.
   * Normalizes to uppercase with colons (XX:XX:XX:XX:XX:XX).
   */
  public static create(address: string): Result<MACAddress> {
    if (!MAC_REGEX.test(address)) {
      return err('INVALID_MAC_ADDRESS', `Invalid MAC address format: ${address}`);
    }

    const normalized = address.toUpperCase().replace(/-/g, ':');
    return ok(new MACAddress(normalized));
  }

  /**
   * Generates a random locally-administered unicast MAC address.
   * Format: x2:xx:xx:xx:xx:xx, x6:xx:xx:xx:xx:xx, xA:xx:xx:xx:xx:xx, or xE:xx:xx:xx:xx:xx
   * For simplicity in simulation, we use 02:xx:xx:xx:xx:xx.
   */
  public static generateLocal(): MACAddress {
    const bytes = new Uint8Array(6);
    for (let i = 0; i < 6; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    // Set locally administered bit, clear multicast bit
    bytes[0] = (bytes[0]! & 0b11111100) | 0b00000010;

    const str = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(':');

    return new MACAddress(str);
  }

  public toString(): string {
    return this.value;
  }
}
