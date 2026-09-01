/**
 * @file simulator/src/network/ipv4/IPv4Subnet.ts
 *
 * Domain model for IPv4 subnets and CIDR configuration.
 * Performs deterministic prefix math, broadcast calculation, and host validation.
 */

import { type Result, err, ok } from '../../types/errors.js';
import { IPv4Address } from './IPv4Address.js';

export class IPv4Subnet {
  public readonly networkAddress: string;
  public readonly prefixLength: number;
  public readonly subnetMask: string;
  public readonly broadcastAddress: string;

  private constructor(
    networkAddress: string,
    prefixLength: number,
    subnetMask: string,
    broadcastAddress: string,
  ) {
    this.networkAddress = networkAddress;
    this.prefixLength = prefixLength;
    this.subnetMask = subnetMask;
    this.broadcastAddress = broadcastAddress;
  }

  /**
   * Creates an IPv4Subnet from any IP address and prefix length.
   * e.g., create("192.168.1.10", 24) -> network: "192.168.1.0"
   */
  public static create(ipAddress: string, prefixLength: number): Result<IPv4Subnet> {
    if (!IPv4Address.isValid(ipAddress)) {
      return err('INVALID_IPV4_ADDRESS', `Invalid IPv4 address format: ${ipAddress}`);
    }
    if (!IPv4Address.isValidPrefix(prefixLength)) {
      return err('INVALID_PREFIX_LENGTH', `Invalid prefix length: ${prefixLength}`);
    }

    const ipInt = IPv4Address.ipToInt(ipAddress);
    const maskInt = IPv4Subnet.prefixToMaskInt(prefixLength);

    const netInt = (ipInt & maskInt) >>> 0;

    // Broadcast is network address OR'd with the inverted mask
    const invertedMaskInt = ~maskInt >>> 0;
    const bcastInt = (netInt | invertedMaskInt) >>> 0;

    return ok(
      new IPv4Subnet(
        IPv4Address.intToIp(netInt),
        prefixLength,
        IPv4Address.intToIp(maskInt),
        IPv4Address.intToIp(bcastInt),
      ),
    );
  }

  /**
   * Parse a CIDR string (e.g. "192.168.1.10/24") into an IP and a Subnet.
   * Note: The parsed Subnet's networkAddress will be "192.168.1.0", not the host IP.
   */
  public static fromCidr(cidr: string): Result<{ ip: string; subnet: IPv4Subnet }> {
    const parts = cidr.split('/');
    if (parts.length !== 2) {
      return err('INVALID_CIDR', `Invalid CIDR format: ${cidr}`);
    }

    const ip = parts[0]!;
    const prefixStr = parts[1]!;
    const prefix = parseInt(prefixStr, 10);

    if (prefixStr !== prefix.toString()) {
      return err('INVALID_CIDR', `Invalid CIDR prefix: ${cidr}`);
    }

    const subnetRes = IPv4Subnet.create(ip, prefix);
    if (!subnetRes.ok) return subnetRes;

    return ok({ ip, subnet: subnetRes.value });
  }

  /**
   * Checks if a given IP address belongs to this subnet.
   */
  public contains(ipAddress: string): boolean {
    if (!IPv4Address.isValid(ipAddress)) return false;

    const ipInt = IPv4Address.ipToInt(ipAddress);
    const maskInt = IPv4Subnet.prefixToMaskInt(this.prefixLength);
    const netInt = (ipInt & maskInt) >>> 0;

    return IPv4Address.intToIp(netInt) === this.networkAddress;
  }

  /**
   * Determines if the given IP is a valid host address in this subnet.
   * For /32: The only address is a valid host.
   * For /31: Both network and broadcast addresses are valid hosts (RFC 3021).
   * For /0 - /30: The network address and broadcast address are NOT valid hosts.
   */
  public isValidHost(ipAddress: string): boolean {
    if (!this.contains(ipAddress)) return false;

    if (this.prefixLength === 32) return true;
    if (this.prefixLength === 31) return true;

    // For /0 to /30, host cannot be network or broadcast
    if (ipAddress === this.networkAddress) return false;
    if (ipAddress === this.broadcastAddress) return false;

    return true;
  }

  /**
   * Converts a prefix length (0-32) to a 32-bit subnet mask.
   */
  public static prefixToMaskInt(prefixLength: number): number {
    if (prefixLength === 0) return 0;
    return ~((1 << (32 - prefixLength)) - 1) >>> 0;
  }

  /**
   * Converts a dotted-decimal subnet mask string to a prefix length.
   * Returns null if the mask is invalid or non-contiguous.
   */
  public static maskToPrefixLength(mask: string): number | null {
    if (!IPv4Address.isValid(mask)) return null;

    const maskInt = IPv4Address.ipToInt(mask);

    // Check if mask is contiguous ones followed by zeros.
    // If we invert the mask, add 1, it should be a power of 2 (only one bit set).
    // E.g. mask: 11111111.0.0.0
    // inverted:  00000000.11111111.11111111.11111111
    // +1:        00000001.00000000.00000000.00000000

    const inverted = ~maskInt >>> 0;
    if (inverted === 4294967295) return 0; // /0 case

    const check = (inverted + 1) >>> 0;
    const isPowerOfTwo = check !== 0 && (check & (check - 1)) === 0;

    if (!isPowerOfTwo) return null;

    // Count the zeros in the mask (which are ones in the inverted)
    // We know the number of zeros is log2(check)
    const zeros = Math.log2(check);
    return 32 - zeros;
  }

  /**
   * Convenience utility to check if two IP addresses are in the same subnet for a given prefix.
   */
  public static isSameSubnet(ipA: string, ipB: string, prefixLength: number): boolean {
    if (
      !IPv4Address.isValid(ipA) ||
      !IPv4Address.isValid(ipB) ||
      !IPv4Address.isValidPrefix(prefixLength)
    ) {
      return false;
    }

    const maskInt = IPv4Subnet.prefixToMaskInt(prefixLength);
    const intA = IPv4Address.ipToInt(ipA);
    const intB = IPv4Address.ipToInt(ipB);

    return (intA & maskInt) >>> 0 === (intB & maskInt) >>> 0;
  }
}
