/**
 * simulator/src/packets/ — Packet domain types and processing.
 *
 * IMPLEMENTED:
 *   - Packet domain type (id, source, destination, currentLocation, state,
 *     history, lifecycleHistory)
 *   - Formal 5-state lifecycle: CREATED → QUEUED → FORWARDED → DELIVERED
 *                                QUEUED → DROPPED
 *                                FORWARDED → DROPPED
 *   - Type-safe PacketStateMachine with:
 *       * PacketState enum + transition table
 *       * isValidPacketTransition()  pure predicate
 *       * transitionPacket()        ONLY legal way to mutate state
 *       * lifecycleHistory[]        audit trail of every state transition
 *   - PacketEngine validation against NetworkGraph topology
 *   - Type-safe PacketDropReason (INVALID_PACKET / INVALID_ROUTE / UNREACHABLE
 *     / NO_ROUTE_TO_HOST / TTL_EXPIRED (reserved for Prompt 9))
 *   - Packet registry (active: CREATED/QUEUED/FORWARDED; completed: DELIVERED/DROPPED)
 *
 * ARCHITECTURAL RULE:
 *   This module asks the NetworkGraph for topology validation.
 *   Packets must NOT contain routing logic themselves.
 *   Route calculation is the responsibility of future routing algorithms.
 */

// ─── State Machine ───────────────────────────────────────────────────────────

export {
  PACKET_STATES,
  TERMINAL_PACKET_STATES,
  ALLOWED_PACKET_TRANSITIONS,
  isTerminalPacketState,
  isValidPacketTransition,
  transitionPacket,
  hasReachedState,
} from './PacketStateMachine.js';

export type {
  PacketState,
  PacketLifecycleTransition,
  PacketTransitionReason,
} from './PacketStateMachine.js';

// ─── Packet Domain Model ──────────────────────────────────────────────────────

export type { Packet, CreatePacketOptions } from './Packet.js';
export { PacketFactory } from './Packet.js';

// ─── Packet Drop Reasons ─────────────────────────────────────────────────────

export type { PacketDropReason } from './PacketDropReason.js';
export { isValidPacketDropReason } from './PacketDropReason.js';

// ─── Packet Engine ────────────────────────────────────────────────────────────

export { PacketEngine } from './PacketEngine.js';
