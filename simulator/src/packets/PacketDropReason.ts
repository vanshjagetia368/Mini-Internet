/**
 * @file simulator/src/packets/PacketDropReason.ts
 *
 * Type-safe packet drop reasons.
 *
 * DESIGN NOTES:
 *   - Structured drop reasons for logging, debugging, and analytics
 *   - Extensible for future phases (TTL_EXPIRED in Prompt 9, etc.)
 *   - Type-safe to prevent arbitrary string errors
 */

/**
 * Reasons why a packet might be dropped.
 *
 * CURRENT (Prompt 7):
 *   - INVALID_PACKET: Malformed or invalid packet data
 *   - INVALID_ROUTE: Attempted to forward through non-existent path
 *   - UNREACHABLE: Destination cannot be reached from current location
 *   - NO_ROUTE_TO_HOST: No valid route exists to destination
 *
 * FUTURE (Prompt 9+):
 *   - TTL_EXPIRED: Packet time-to-live exceeded
 *   - Additional congestion, QoS, or security reasons
 */
export type PacketDropReason =
  | 'INVALID_PACKET'
  | 'INVALID_ROUTE'
  | 'UNREACHABLE'
  | 'NO_ROUTE_TO_HOST'
  | 'TTL_EXPIRED'; // Reserved for Prompt 9

/**
 * Validate that a drop reason is recognized.
 * Useful for defensive programming and input validation.
 */
export function isValidPacketDropReason(reason: string): reason is PacketDropReason {
  const validReasons: PacketDropReason[] = [
    'INVALID_PACKET',
    'INVALID_ROUTE',
    'UNREACHABLE',
    'NO_ROUTE_TO_HOST',
    'TTL_EXPIRED',
  ];
  return validReasons.includes(reason as PacketDropReason);
}
