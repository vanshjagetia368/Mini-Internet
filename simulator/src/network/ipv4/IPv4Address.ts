/**
 * @file simulator/src/network/ipv4/IPv4Address.ts
 *
 * Domain model for IPv4 addresses and prefixes.
 * Provides strict validation and uint32 conversion.
 */

import { type Result, err, ok } from '../../types/errors.js';

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export class IPv4Address {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Creates an IPv4Address if the string is a valid dotted-decimal.
   * Enforces strict 0-255 bounds per octet and no leading zeros.
   */
  public static create(address: string): Result<IPv4Address> {
    if (!this.isValid(address)) {
      return err('INVALID_IPV4_ADDRESS', `Invalid IPv4 address format: ${address}`);
    }
    // Normalize (e.g. remove leading zeros if we allowed them, though we don't for now)
    const match = address.match(IPV4_REGEX)!;
    const canonical = `${parseInt(match[1]!, 10)}.${parseInt(match[2]!, 10)}.${parseInt(
      match[3]!,
      10,
    )}.${parseInt(match[4]!, 10)}`;
    return ok(new IPv4Address(canonical));
  }

  /**
   * Basic check for A.B.C.D where 0 <= octet <= 255.
   * Rejects malformed strings like 10.01.1.1 or 256.0.0.1
   */
  public static isValid(address: string): boolean {
    const match = address.match(IPV4_REGEX);
    if (!match) return false;

    for (let i = 1; i <= 4; i++) {
      const octetStr = match[i]!;
      // Reject leading zeros (e.g. "01" or "001") except for "0"
      if (octetStr.length > 1 && octetStr.startsWith('0')) {
        return false;
      }
      const octet = parseInt(octetStr, 10);
      if (octet < 0 || octet > 255) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if a subnet prefix length is valid (0-32).
   */
  public static isValidPrefix(prefix: number): boolean {
    return Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
  }

  /**
   * Returns the canonical string representation (e.g., "192.168.1.1").
   */
  public toString(): string {
    return this.value;
  }

  /**
   * Returns the 32-bit unsigned integer representation of this address.
   */
  public toUint32(): number {
    return IPv4Address.ipToInt(this.value);
  }

  /**
   * Internal static utility to convert a canonical IP string to a uint32.
   */
  public static ipToInt(ip: string): number {
    const match = ip.match(IPV4_REGEX)!;
    const o1 = parseInt(match[1]!, 10);
    const o2 = parseInt(match[2]!, 10);
    const o3 = parseInt(match[3]!, 10);
    const o4 = parseInt(match[4]!, 10);

    return ((o1 << 24) | (o2 << 16) | (o3 << 8) | o4) >>> 0;
  }

  /**
   * Internal static utility to convert a uint32 to a canonical IP string.
   */
  public static intToIp(ipInt: number): string {
    const uint = ipInt >>> 0;
    const o1 = (uint >>> 24) & 255;
    const o2 = (uint >>> 16) & 255;
    const o3 = (uint >>> 8) & 255;
    const o4 = uint & 255;
    return `${o1}.${o2}.${o3}.${o4}`;
  }
}
