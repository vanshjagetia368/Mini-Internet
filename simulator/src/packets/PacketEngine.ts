/**
 * @file simulator/src/packets/PacketEngine.ts
 *
 * The packet processing engine - core packet lifecycle management.
 *
 * RESPONSIBILITIES:
 *   - Create, send, forward, deliver, and drop packets
 *   - Validate all packet operations against network topology
 *   - Maintain packet registry (active and completed packets)
 *   - Emit packet lifecycle events
 *   - Delegate ALL state mutations to PacketStateMachine.transitionPacket()
 *     so the formal state machine is the sole authority on lifecycle.
 *
 * ARCHITECTURAL RULE:
 *   PacketEngine ≠ RoutingEngine
 *   This engine validates next hops but does NOT calculate routes.
 *   Route calculation is the responsibility of future routing algorithms.
 *
 * DESIGN NOTES:
 *   - Device-level addressing: packets move between devices
 *   - Topology respect: all forwarding validated against NetworkGraph
 *   - Event-driven: all state changes emit events
 *   - State management: NEVER directly mutate packet.state.
 *     ALWAYS go through transitionPacket().
 */

import type { DeviceId, PacketId, LinkId } from '../types/ids.js';
import type { Result, SimulatorErrorCode } from '../types/errors.js';
import { ok, err } from '../types/errors.js';
import type { NetworkGraph } from '../network/NetworkGraph.js';
import type { EventBus } from '../events/EventBus.js';
import type { SimulationEvent } from '../types/events.js';
import { Packet, CreatePacketOptions, PacketFactory } from './Packet.js';
import { transitionPacket, isTerminalPacketState } from './PacketStateMachine.js';
import type { PacketDropReason } from './PacketDropReason.js';
import { IPv4Address } from '../network/ipv4/IPv4Address.js';
import { IdFactory } from '../types/ids.js';

// ─── Packet Engine ─────────────────────────────────────────────────────────────

/**
 * Core packet processing engine.
 *
 * Manages packet lifecycle, validates operations against network topology,
 * and maintains the packet registry.
 *
 * STATE MACHINE INTEGRATION:
 *   Every state change (send→QUEUED, forward→FORWARDED, deliver→DELIVERED,
 *   drop→DROPPED) is routed through transitionPacket() for validation
 *   and lifecycle-history recording. No direct assignment of packet.state.
 */
export class PacketEngine {
  private readonly packets = new Map<PacketId, Packet>();

  constructor(
    private readonly graph: NetworkGraph,
    private readonly eventBus: EventBus,
  ) {}

  // ── Packet Creation ────────────────────────────────────────────────────────

  /**
   * Create a new packet with validation.
   *
   * Validates:
   * - Source device exists
   * - Destination device exists
   * - Source IP is valid IPv4
   * - Destination IP is valid IPv4
   *
   * Initial state: CREATED (lifecycleHistory = [] — CREATED is implicit, first
   * transition CREATED→QUEUED recorded when sendPacket() succeeds).
   *
   * Emits: PACKET_CREATED event
   */
  createPacket(options: CreatePacketOptions): Result<Packet> {
    if (!this.graph.hasDevice(options.sourceDeviceId)) {
      return err('ENTITY_NOT_FOUND', `Source device ${options.sourceDeviceId} not found`);
    }

    if (!this.graph.hasDevice(options.destinationDeviceId)) {
      return err('ENTITY_NOT_FOUND', `Destination device ${options.destinationDeviceId} not found`);
    }

    if (!IPv4Address.isValid(options.sourceIp)) {
      return err('INVALID_IPV4_ADDRESS', `Invalid source IP address: ${options.sourceIp}`);
    }

    if (!IPv4Address.isValid(options.destinationIp)) {
      return err(
        'INVALID_IPV4_ADDRESS',
        `Invalid destination IP address: ${options.destinationIp}`,
      );
    }

    const packet = PacketFactory.create(options, () => IdFactory.packet());

    this.packets.set(packet.id, packet);

    this._emitPacketCreated(packet);

    return ok(packet);
  }

  // ── Packet Sending ─────────────────────────────────────────────────────────

  /**
   * Send a packet into the network pipeline.
   *
   * Lifecycle: CREATED → QUEUED (reason='send')
   *
   * Validates:
   * - Packet exists
   * - Packet is in CREATED state (exact precondition from state machine)
   * - Source device still exists in topology
   *
   * State change routed through transitionPacket(). lifecycleHistory
   * gains entry #1 = { CREATED → QUEUED, reason='send' }.
   *
   * Emits: PACKET_QUEUED is not a separate event type; CREATED covers
   *        birth and the QUEUED transition is observable via lifecycleHistory.
   */
  sendPacket(packetId: PacketId): Result<void> {
    const packet = this.packets.get(packetId);
    if (!packet) {
      return err('ENTITY_NOT_FOUND', `Packet ${packetId} not found`);
    }

    if (!this.graph.hasDevice(packet.sourceDeviceId)) {
      return err('ENTITY_UNAVAILABLE', `Source device ${packet.sourceDeviceId} no longer exists`);
    }

    const transitionResult = transitionPacket(packet, 'QUEUED', {
      reason: 'send',
      atDeviceId: packet.sourceDeviceId,
    });

    if (!transitionResult.ok) {
      return err(
        transitionResult.error.code as SimulatorErrorCode,
        transitionResult.error.message,
        transitionResult.error.context,
      );
    }

    this.packets.set(packetId, transitionResult.value);

    return ok(undefined);
  }

  // ── Packet Forwarding ───────────────────────────────────────────────────────

  /**
   * Forward a packet to the next hop device.
   *
   * Lifecycle transitions (via state machine):
   *   QUEUED    → FORWARDED  (reason='forward')   — first hop
   *   FORWARDED → FORWARDED  (reason='forward')   — subsequent hops
   *
   * Validates:
   * - Packet exists
   * - State machine allows QUEUED→FORWARDED or FORWARDED→FORWARDED
   * - Current location device still exists
   * - Next hop device exists
   * - Link between currentLocation and nextHop exists AND is UP
   *
   * Does NOT perform routing. The caller must already know the next hop.
   *
   * Emits: PACKET_FORWARDED event on each successful hop.
   */
  forwardPacket(packetId: PacketId, nextHopDeviceId: DeviceId): Result<void> {
    const packet = this.packets.get(packetId);
    if (!packet) {
      return err('ENTITY_NOT_FOUND', `Packet ${packetId} not found`);
    }

    const stateResult = transitionPacket(packet, 'FORWARDED', {
      reason: 'forward',
      atDeviceId: packet.currentLocation,
    });

    if (!stateResult.ok) {
      return err(
        stateResult.error.code as SimulatorErrorCode,
        stateResult.error.message,
        stateResult.error.context,
      );
    }

    if (!this.graph.hasDevice(packet.currentLocation)) {
      return err(
        'ENTITY_UNAVAILABLE',
        `Current location ${packet.currentLocation} no longer exists`,
      );
    }

    if (!this.graph.hasDevice(nextHopDeviceId)) {
      return err('ENTITY_NOT_FOUND', `Next hop device ${nextHopDeviceId} not found`);
    }

    const link = this.graph.getLinkBetween(packet.currentLocation, nextHopDeviceId);
    if (!link) {
      return err(
        'INVALID_ROUTE',
        `No link exists between current location ${packet.currentLocation} and next hop ${nextHopDeviceId}`,
      );
    }

    if (link.status !== 'UP') {
      return err(
        'ENTITY_UNAVAILABLE',
        `Link between ${packet.currentLocation} and ${nextHopDeviceId} is not UP`,
      );
    }

    const updatedHistory = [...packet.history, nextHopDeviceId];
    const forwardedPacket: Packet = {
      ...stateResult.value,
      currentLocation: nextHopDeviceId,
      history: updatedHistory,
    };

    this.packets.set(packetId, forwardedPacket);

    this._emitPacketForwarded(forwardedPacket, link.id);

    return ok(undefined);
  }

  // ── Packet Delivery ─────────────────────────────────────────────────────────

  /**
   * Deliver a packet at its destination.
   *
   * Lifecycle: FORWARDED → DELIVERED (reason='destination_reached')
   *
   * For local-delivery convenience (source === destination, or packet already
   * arrived at destination while still in QUEUED), this method transparently
   * performs QUEUED → FORWARDED (reason='forward', at destination) before
   * the final FORWARDED → DELIVERED step. This keeps the state-transition
   * table untouched while matching the Prompt 7 local-delivery semantics.
   *
   * Validates:
   * - Packet exists
   * - currentLocation === destinationDeviceId (delivery ONLY at destination)
   * - State machine allows the required transition(s)
   *
   * Emits: PACKET_DELIVERED event.
   */
  deliverPacket(packetId: PacketId): Result<void> {
    const packet = this.packets.get(packetId);
    if (!packet) {
      return err('ENTITY_NOT_FOUND', `Packet ${packetId} not found`);
    }

    if (isTerminalPacketState(packet.state)) {
      const terminalProbe = transitionPacket(packet, 'DELIVERED', {
        reason: 'destination_reached',
        atDeviceId: packet.currentLocation,
      });
      return err(
        terminalProbe.ok
          ? 'SIMULATION_STATE_ERROR'
          : (terminalProbe.error.code as SimulatorErrorCode),
        terminalProbe.ok ? 'Packet is in a terminal state' : terminalProbe.error.message,
        terminalProbe.ok ? undefined : terminalProbe.error.context,
      );
    }

    if (packet.currentLocation !== packet.destinationDeviceId) {
      return err(
        'INVALID_ROUTE',
        `Cannot deliver packet: current location ${packet.currentLocation} is not destination ${packet.destinationDeviceId}`,
      );
    }

    let workingPacket = packet;

    if (workingPacket.state === 'QUEUED') {
      const promResult = transitionPacket(workingPacket, 'FORWARDED', {
        reason: 'forward',
        atDeviceId: workingPacket.currentLocation,
      });
      if (!promResult.ok) {
        return err(
          promResult.error.code as SimulatorErrorCode,
          promResult.error.message,
          promResult.error.context,
        );
      }
      workingPacket = promResult.value;
    }

    const deliverResult = transitionPacket(workingPacket, 'DELIVERED', {
      reason: 'destination_reached',
      atDeviceId: workingPacket.currentLocation,
    });

    if (!deliverResult.ok) {
      return err(
        deliverResult.error.code as SimulatorErrorCode,
        deliverResult.error.message,
        deliverResult.error.context,
      );
    }

    this.packets.set(packetId, deliverResult.value);

    this._emitPacketDelivered(deliverResult.value);

    return ok(undefined);
  }

  // ── Packet Dropping ─────────────────────────────────────────────────────────

  /**
   * Drop a packet with a specified reason.
   *
   * Lifecycle (via state machine — depends on current state):
   *   CREATED cannot drop (table restriction — must be QUEUED first in normal flow;
   *           if caller really needs to drop a CREATED packet, they can sendPacket()
   *           then dropPacket(), or we may later relax the table — but per the
   *           roadmap the drop paths are QUEUED→DROPPED and FORWARDED→DROPPED).
   *   QUEUED    → DROPPED
   *   FORWARDED → DROPPED
   *
   * Validates:
   * - Packet exists
   * - State is non-terminal AND transition → DROPPED is allowed by table
   *
   * Structured reason is recorded both in lifecycleHistory (reason field) AND
   * in the PACKET_DROPPED event.
   *
   * Emits: PACKET_DROPPED event.
   */
  dropPacket(packetId: PacketId, reason: PacketDropReason): Result<void> {
    const packet = this.packets.get(packetId);
    if (!packet) {
      return err('ENTITY_NOT_FOUND', `Packet ${packetId} not found`);
    }

    const dropStateMachineReason: Parameters<typeof transitionPacket>[2]['reason'] =
      _mapDropReasonToStateMachineReason(reason);

    const transitionResult = transitionPacket(packet, 'DROPPED', {
      reason: dropStateMachineReason,
      atDeviceId: packet.currentLocation,
    });

    if (!transitionResult.ok) {
      return err(
        transitionResult.error.code as SimulatorErrorCode,
        transitionResult.error.message,
        transitionResult.error.context,
      );
    }

    this.packets.set(packetId, transitionResult.value);

    this._emitPacketDropped(transitionResult.value, reason);

    return ok(undefined);
  }

  // ── Query Operations ────────────────────────────────────────────────────────

  /**
   * Get a packet by ID (returns a defensive copy so callers can't mutate internal state).
   */
  getPacket(id: PacketId): Packet | undefined {
    const packet = this.packets.get(id);
    return packet
      ? { ...packet, history: [...packet.history], lifecycleHistory: [...packet.lifecycleHistory] }
      : undefined;
  }

  /**
   * Check if a packet exists.
   */
  hasPacket(id: PacketId): boolean {
    return this.packets.has(id);
  }

  /**
   * Get all non-terminal packets: CREATED, QUEUED, or FORWARDED.
   * Returns defensive copies.
   */
  getActivePackets(): Packet[] {
    const active: Packet[] = [];
    for (const packet of this.packets.values()) {
      if (packet.state === 'CREATED' || packet.state === 'QUEUED' || packet.state === 'FORWARDED') {
        active.push({
          ...packet,
          history: [...packet.history],
          lifecycleHistory: [...packet.lifecycleHistory],
        });
      }
    }
    return active;
  }

  /**
   * Get all terminal packets: DELIVERED or DROPPED.
   * Returns defensive copies.
   */
  getCompletedPackets(): Packet[] {
    const completed: Packet[] = [];
    for (const packet of this.packets.values()) {
      if (packet.state === 'DELIVERED' || packet.state === 'DROPPED') {
        completed.push({
          ...packet,
          history: [...packet.history],
          lifecycleHistory: [...packet.lifecycleHistory],
        });
      }
    }
    return completed;
  }

  // ── Event Emission Helpers ───────────────────────────────────────────────────

  private _emitPacketCreated(packet: Packet): void {
    const event: SimulationEvent = {
      id: IdFactory.event(),
      type: 'PACKET_CREATED',
      packetId: packet.id,
      sourceDeviceId: packet.sourceDeviceId,
      destinationDeviceId: packet.destinationDeviceId,
      simulationTime: 0,
      wallClockMs: Date.now(),
    };
    this.eventBus.emit(event);
  }

  private _emitPacketForwarded(packet: Packet, linkId: LinkId): void {
    const event: SimulationEvent = {
      id: IdFactory.event(),
      type: 'PACKET_FORWARDED',
      packetId: packet.id,
      atDeviceId: packet.currentLocation,
      viaLinkId: linkId,
      simulationTime: 0,
      wallClockMs: Date.now(),
    };
    this.eventBus.emit(event);
  }

  private _emitPacketDelivered(packet: Packet): void {
    const event: SimulationEvent = {
      id: IdFactory.event(),
      type: 'PACKET_DELIVERED',
      packetId: packet.id,
      destinationDeviceId: packet.destinationDeviceId,
      simulationTime: 0,
      wallClockMs: Date.now(),
    };
    this.eventBus.emit(event);
  }

  private _emitPacketDropped(packet: Packet, reason: PacketDropReason): void {
    const event: SimulationEvent = {
      id: IdFactory.event(),
      type: 'PACKET_DROPPED',
      packetId: packet.id,
      atDeviceId: packet.currentLocation,
      reason: reason,
      simulationTime: 0,
      wallClockMs: Date.now(),
    };
    this.eventBus.emit(event);
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Map PacketDropReason (external, domain-level) to a valid
 * PacketTransitionReason (internal, state-machine-level).
 *
 * This keeps the two concerns loosely coupled: the domain's drop reasons
 * can grow independently of the state machine's reason vocabulary, while
 * lifecycleHistory still stores a structured, meaningful tag.
 */
function _mapDropReasonToStateMachineReason(
  r: PacketDropReason,
): 'invalid_packet' | 'invalid_route' | 'unreachable' | 'no_route_to_host' | 'ttl_expired' {
  switch (r) {
    case 'INVALID_PACKET':
      return 'invalid_packet';
    case 'INVALID_ROUTE':
      return 'invalid_route';
    case 'UNREACHABLE':
      return 'unreachable';
    case 'NO_ROUTE_TO_HOST':
      return 'no_route_to_host';
    case 'TTL_EXPIRED':
      return 'ttl_expired';
  }
}
