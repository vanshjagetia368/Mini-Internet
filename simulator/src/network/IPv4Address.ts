/**
 * @file simulator/src/network/IPv4Address.ts
 *
 * Domain model for IPv4 addresses and prefixes.
 * Provides basic validation (not full routing functionality yet).
 */

import { type Result, err, ok } from '../types/errors.js';

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export class IPv4Address {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Creates an IPv4Address if the string is a valid dotted-decimal.
   */
  public static create(address: string): Result<IPv4Address> {
    if (!this.isValid(address)) {
      return err('INVALID_IPV4_ADDRESS', `Invalid IPv4 address format: ${address}`);
    }
    return ok(new IPv4Address(address));
  }

  /**
   * Basic check for A.B.C.D where 0 <= octet <= 255.
   */
  public static isValid(address: string): boolean {
    const match = address.match(IPV4_REGEX);
    if (!match) return false;

    for (let i = 1; i <= 4; i++) {
      const octet = parseInt(match[i]!, 10);
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

  public toString(): string {
    return this.value;
  }
}
