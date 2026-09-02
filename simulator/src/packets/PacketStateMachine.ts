/**
 * @file simulator/src/packets/PacketStateMachine.ts
 *
 * Formal, deterministic packet lifecycle state machine.
 *
 * RESPONSIBILITIES:
 *   - Declare the authoritative PacketState union (CREATED / QUEUED / FORWARDED / DELIVERED / DROPPED).
 *   - Encode the allowed transition table as pure data.
 *   - Provide isValidTransition(current, next) for precondition checks.
 *   - Provide transitionPacket(packet, nextState, reason?) as the ONLY legal
 *     mechanism for mutating packet state.
 *   - Record every successful transition into packet.lifecycleHistory for
 *     later inspection, visualization, debugging, and analytics.
 *
 * CRITICAL RULES:
 *   - NO uncontrolled direct mutation of packet.state from outside this module.
 *   - DELIVERED and DROPPED are TERMINAL. They can never transition again.
 *   - No backward jumps: QUEUED -> CREATED, FORWARDED -> QUEUED, FORWARDED -> CREATED are forbidden.
 *   - Packet identity (id, sourceDeviceId, destinationDeviceId) is NEVER touched.
 *   - No simulation clock, no wall-clock time as official lifecycle stamp.
 *     monotonicOrdinal only records ordering (Prompt 20 will add sim-time).
 */

import type { DeviceId } from '../types/ids.js';
import type { Packet } from './Packet.js';
import type { PacketDropReason } from './PacketDropReason.js';
import { err, ok } from '../types/errors.js';
import type { Result } from '../types/errors.js';

// ─── Packet State Enumeration ────────────────────────────────────────────────

export const PACKET_STATES = ['CREATED', 'QUEUED', 'FORWARDED', 'DELIVERED', 'DROPPED'] as const;

/**
 * The authoritative 5-state packet lifecycle (Prompt 8 roadmap).
 *
 *   CREATED
 *      │
 *      ▼
 *   QUEUED ─────────────────► DROPPED
 *      │
 *      ▼
 *   FORWARDED ──────────────► DROPPED
 *      │  │
 *      │  └──── FORWARDED (multi-hop loop)
 *      ▼
 *   DELIVERED
 *
 * DELIVERED and DROPPED are terminal (no further transitions).
 */
export type PacketState = (typeof PACKET_STATES)[number];

// ─── Transition Reason Tags ───────────────────────────────────────────────────

/**
 * Structured reason tags for lifecycle transitions.
 *
 * Extensible without breaking the state machine: Prompt 9 will add
 * 'ttl_expired' which simply invokes transitionPacket(..., DROPPED, 'ttl_expired').
 */
export type PacketTransitionReason =
  | 'send'
  | 'forward'
  | 'destination_reached'
  | 'invalid_route'
  | 'unreachable'
  | 'no_route_to_host'
  | 'invalid_packet'
  | 'ttl_expired'
  | 'other';

// ─── Lifecycle History Entry ──────────────────────────────────────────────────

/**
 * Immutable record of a single lifecycle state transition.
 *
 * Recorded separately from device-traversal history:
 *   - history = [PC1, R1, R2, Server]  (location hops)
 *   - lifecycleHistory = [CREATED->QUEUED, QUEUED->FORWARDED, FORWARDED->FORWARDED, FORWARDED->DELIVERED]
 */
export interface PacketLifecycleTransition {
  /** State prior to the transition */
  readonly from: PacketState;
  /** State after the transition */
  readonly to: PacketState;
  /** Structured reason why the transition occurred */
  readonly reason: PacketTransitionReason | PacketDropReason;
  /**
   * Monotonic, 1-based ordinal within the owning packet.
   * Not wall-clock, not simulation-time — just deterministic ordering
   * (Prompt 20 simulation-clock can map these later).
   */
  readonly ordinal: number;
  /**
   * Device where the packet logically was when the transition happened,
   * if available at the call-site. null is acceptable when unknown.
   */
  readonly atDeviceId: DeviceId | null;
}

// ─── Terminal State Helpers ───────────────────────────────────────────────────

export const TERMINAL_PACKET_STATES: ReadonlySet<PacketState> = new Set<PacketState>([
  'DELIVERED',
  'DROPPED',
]);

export function isTerminalPacketState(state: PacketState): boolean {
  return TERMINAL_PACKET_STATES.has(state);
}

// ─── Allowed Transition Table ─────────────────────────────────────────────────

/**
 * Authoritative allowed transitions.
 *
 *   CREATED   → { QUEUED }
 *   QUEUED    → { FORWARDED, DROPPED }
 *   FORWARDED → { FORWARDED, DELIVERED, DROPPED }
 *   DELIVERED → { }        (terminal)
 *   DROPPED   → { }        (terminal)
 *
 * This table is the single source of truth. Every state-machine decision
 * references it. The table is intentionally represented as data so future
 * additions (e.g. error sub-states) require a single table edit.
 */
export const ALLOWED_PACKET_TRANSITIONS: Readonly<Record<PacketState, ReadonlySet<PacketState>>> = {
  CREATED: new Set<PacketState>(['QUEUED']),
  QUEUED: new Set<PacketState>(['FORWARDED', 'DROPPED']),
  FORWARDED: new Set<PacketState>(['FORWARDED', 'DELIVERED', 'DROPPED']),
  DELIVERED: new Set<PacketState>([]),
  DROPPED: new Set<PacketState>([]),
};

// ─── Validation: Pure Predicates ──────────────────────────────────────────────

/**
 * Pure predicate: is (current -> next) a legal transition?
 *
 * Does not mutate anything. Safe to call for pre-condition checks.
 * Uses the ALLOWED_PACKET_TRANSITIONS table as single source of truth.
 */
export function isValidPacketTransition(current: PacketState, next: PacketState): boolean {
  const allowed = ALLOWED_PACKET_TRANSITIONS[current];
  return allowed.has(next);
}

// ─── Controlled Transition: THE ONLY WAY STATE CHANGES ────────────────────────

export interface TransitionPacketOptions {
  readonly reason: PacketTransitionReason | PacketDropReason;
  readonly atDeviceId?: DeviceId;
}

/**
 * Controlled state transition.
 *
 * This function is the SOLE authoriser of packet.state mutation.
 * No other module in the system should ever assign packet.state directly.
 *
 * Returns a Result containing the updated packet clone (with lifecycleHistory
 * appended) or a SIMULATION_STATE_ERROR describing why the transition was
 * rejected.
 *
 * Guarantees:
 *   1. Validates current -> next via ALLOWED_PACKET_TRANSITIONS.
 *   2. Never mutates the input packet in place (always returns a clone).
 *   3. Never touches packet.id / sourceDeviceId / destinationDeviceId.
 *   4. Appends a PacketLifecycleTransition record with deterministic ordinal.
 *   5. Terminal states (DELIVERED, DROPPED) always reject any next transition.
 */
export function transitionPacket(
  packet: Packet,
  nextState: PacketState,
  opts: TransitionPacketOptions,
): Result<Packet> {
  const currentState = packet.state;

  if (!isValidPacketTransition(currentState, nextState)) {
    return err(
      'SIMULATION_STATE_ERROR',
      `Invalid packet state transition: ${currentState} → ${nextState} (reason=${opts.reason})`,
      {
        packetId: packet.id,
        currentState,
        nextState,
        reason: opts.reason,
        terminal: isTerminalPacketState(currentState),
      },
    );
  }

  const nextOrdinal = packet.lifecycleHistory.length + 1;

  const transitionEntry: PacketLifecycleTransition = {
    from: currentState,
    to: nextState,
    reason: opts.reason,
    ordinal: nextOrdinal,
    atDeviceId: opts.atDeviceId ?? packet.currentLocation,
  };

  const updated: Packet = {
    ...packet,
    state: nextState,
    lifecycleHistory: [...packet.lifecycleHistory, transitionEntry],
  };

  return ok(updated);
}

// ─── Derived Queries ──────────────────────────────────────────────────────────

/**
 * Return true iff the packet has reached at least the given state
 * according to its lifecycleHistory. Useful for tests and for consumers
 * that want to know "has this packet ever been QUEUED?".
 */
export function hasReachedState(packet: Packet, target: PacketState): boolean {
  if (packet.state === target) return true;
  for (const entry of packet.lifecycleHistory) {
    if (entry.to === target) return true;
    if (entry.from === target) return true;
  }
  return false;
}
