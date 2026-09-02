/**
 * simulator/src/packets/ — Packet domain types and processing.
 *
 * IMPLEMENTED (Phase 3):
 *   - Packet domain type (id, source, destination, currentLocation, state, history)
 *   - Packet lifecycle state machine (CREATED → IN_TRANSIT → DELIVERED/DROPPED)
 *   - Packet forwarding engine (validates next hops, does NOT implement routing)
 *   - Packet drop reasons (type-safe structured reasons)
 *   - Packet registry (active and completed packets)
 *
 * ARCHITECTURAL RULE:
 *   This module asks the NetworkGraph for topology validation.
 *   Packets must NOT contain routing logic themselves.
 *   Route calculation is the responsibility of future routing algorithms.
 */

// ─── Packet Domain Model ──────────────────────────────────────────────────────

export type { PacketState } from './Packet.js';
export type { Packet, CreatePacketOptions } from './Packet.js';
export { PacketFactory } from './Packet.js';

// ─── Packet Drop Reasons ─────────────────────────────────────────────────────

export type { PacketDropReason } from './PacketDropReason.js';
export { isValidPacketDropReason } from './PacketDropReason.js';

// ─── Packet Engine ─────────────────────────────────────────────────────────────

export { PacketEngine } from './PacketEngine.js';
