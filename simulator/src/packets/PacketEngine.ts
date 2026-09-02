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
 *   - Enforce packet state machine invariants
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
 *   - State management: centralized through engine methods
 */

import type { DeviceId, PacketId, LinkId } from '../types/ids.js';
import type { Result, SimulatorErrorCode } from '../types/errors.js';
import { ok, err } from '../types/errors.js';
import type { NetworkGraph } from '../network/NetworkGraph.js';
import type { EventBus } from '../events/EventBus.js';
import type { SimulationEvent } from '../types/events.js';
import { Packet, PacketState, CreatePacketOptions, PacketFactory } from './Packet.js';
import type { PacketDropReason } from './PacketDropReason.js';
import { IPv4Address } from '../network/ipv4/IPv4Address.js';
import { IdFactory } from '../types/ids.js';

// ─── Packet Engine ─────────────────────────────────────────────────────────────

/**
 * Core packet processing engine.
 *
 * Manages packet lifecycle, validates operations against network topology,
 * and maintains the packet registry.
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
   * - Handles local delivery when source=destination
   *
   * Emits: PACKET_CREATED event
   */
  createPacket(options: CreatePacketOptions): Result<Packet> {
    // Validate source device exists
    if (!this.graph.hasDevice(options.sourceDeviceId)) {
      return err('ENTITY_NOT_FOUND', `Source device ${options.sourceDeviceId} not found`);
    }

    // Validate destination device exists
    if (!this.graph.hasDevice(options.destinationDeviceId)) {
      return err('ENTITY_NOT_FOUND', `Destination device ${options.destinationDeviceId} not found`);
    }

    // Validate source IP address
    if (!IPv4Address.isValid(options.sourceIp)) {
      return err('INVALID_IPV4_ADDRESS', `Invalid source IP address: ${options.sourceIp}`);
    }

    // Validate destination IP address
    if (!IPv4Address.isValid(options.destinationIp)) {
      return err('INVALID_IPV4_ADDRESS', `Invalid destination IP address: ${options.destinationIp}`);
    }

    // Create packet using factory
    const packet = PacketFactory.create(options, () => IdFactory.packet());

    // Store in registry
    this.packets.set(packet.id, packet);

    // Emit creation event
    this._emitPacketCreated(packet);

    return ok(packet);
  }

  // ── Packet Sending ─────────────────────────────────────────────────────────

  /**
   * Send a packet into the network.
   *
   * Validates:
   * - Packet exists
   * - Packet is in CREATED state
   * - Source device exists
   *
   * For local delivery (source=destination), this is a no-op state transition.
   * The packet can be delivered immediately via deliverPacket().
   *
   * Emits: No specific event (state change is implicit)
   */
  sendPacket(packetId: PacketId): Result<void> {
    const packet = this.packets.get(packetId);
    if (!packet) {
      return err('ENTITY_NOT_FOUND', `Packet ${packetId} not found`);
    }

    // Validate packet state
    if (packet.state !== 'CREATED') {
      return err('SIMULATION_STATE_ERROR', `Cannot send packet in state ${packet.state}`);
    }

    // Validate source device still exists
    if (!this.graph.hasDevice(packet.sourceDeviceId)) {
      return err('ENTITY_UNAVAILABLE', `Source device ${packet.sourceDeviceId} no longer exists`);
    }

    // Transition to IN_TRANSIT
    const updatedPacket = { ...packet, state: 'IN_TRANSIT' as PacketState };
    this.packets.set(packetId, updatedPacket);

    return ok(undefined);
  }

  // ── Packet Forwarding ───────────────────────────────────────────────────────

  /**
   * Forward a packet to the next hop device.
   *
   * Validates:
   * - Packet exists
   * - Packet is in IN_TRANSIT state
   * - Current location and next hop are connected via graph
   *
   * Emits: PACKET_FORWARDED event
   */
  forwardPacket(packetId: PacketId, nextHopDeviceId: DeviceId): Result<void> {
    const packet = this.packets.get(packetId);
    if (!packet) {
      return err('ENTITY_NOT_FOUND', `Packet ${packetId} not found`);
    }

    // Validate packet state
    if (packet.state !== 'IN_TRANSIT') {
      return err('SIMULATION_STATE_ERROR', `Cannot forward packet in state ${packet.state}`);
    }

    // Validate current location
    if (!this.graph.hasDevice(packet.currentLocation)) {
      return err('ENTITY_UNAVAILABLE', `Current location ${packet.currentLocation} no longer exists`);
    }

    // Validate next hop exists
    if (!this.graph.hasDevice(nextHopDeviceId)) {
      return err('ENTITY_NOT_FOUND', `Next hop device ${nextHopDeviceId} not found`);
    }

    // Validate connection exists between current location and next hop
    const link = this.graph.getLinkBetween(packet.currentLocation, nextHopDeviceId);
    if (!link) {
      return err(
        'INVALID_ROUTE',
        `No link exists between current location ${packet.currentLocation} and next hop ${nextHopDeviceId}`,
      );
    }

    // Validate link is UP
    if (link.status !== 'UP') {
      return err('ENTITY_UNAVAILABLE', `Link between ${packet.currentLocation} and ${nextHopDeviceId} is not UP`);
    }

    // Update packet state
    const updatedHistory = [...packet.history, nextHopDeviceId];
    const updatedPacket: Packet = {
      ...packet,
      currentLocation: nextHopDeviceId,
      history: updatedHistory,
    };
    this.packets.set(packetId, updatedPacket);

    // Emit forwarded event
    this._emitPacketForwarded(packet, link.id);

    return ok(undefined);
  }

  // ── Packet Delivery ─────────────────────────────────────────────────────────

  /**
   * Deliver a packet at its destination.
   *
   * Validates:
   * - Packet exists
   * - Packet is in IN_TRANSIT state
   * - Current location equals destination device
   *
   * Emits: PACKET_DELIVERED event
   */
  deliverPacket(packetId: PacketId): Result<void> {
    const packet = this.packets.get(packetId);
    if (!packet) {
      return err('ENTITY_NOT_FOUND', `Packet ${packetId} not found`);
    }

    // Validate packet state
    if (packet.state !== 'IN_TRANSIT') {
      return err('SIMULATION_STATE_ERROR', `Cannot deliver packet in state ${packet.state}`);
    }

    // Validate current location equals destination
    if (packet.currentLocation !== packet.destinationDeviceId) {
      return err(
        'INVALID_ROUTE',
        `Cannot deliver packet: current location ${packet.currentLocation} is not destination ${packet.destinationDeviceId}`,
      );
    }

    // Transition to DELIVERED
    const updatedPacket = { ...packet, state: 'DELIVERED' as PacketState };
    this.packets.set(packetId, updatedPacket);

    // Emit delivered event
    this._emitPacketDelivered(packet);

    return ok(undefined);
  }

  // ── Packet Dropping ─────────────────────────────────────────────────────────

  /**
   * Drop a packet with a specified reason.
   *
   * Validates:
   * - Packet exists
   * - Packet is not already in a terminal state
   *
   * Emits: PACKET_DROPPED event
   */
  dropPacket(packetId: PacketId, reason: PacketDropReason): Result<void> {
    const packet = this.packets.get(packetId);
    if (!packet) {
      return err('ENTITY_NOT_FOUND', `Packet ${packetId} not found`);
    }

    // Validate packet is not already in terminal state
    if (packet.state === 'DELIVERED' || packet.state === 'DROPPED') {
      return err('SIMULATION_STATE_ERROR', `Cannot drop packet in terminal state ${packet.state}`);
    }

    // Transition to DROPPED
    const updatedPacket = { ...packet, state: 'DROPPED' as PacketState };
    this.packets.set(packetId, updatedPacket);

    // Emit dropped event
    this._emitPacketDropped(packet, reason);

    return ok(undefined);
  }

  // ── Query Operations ────────────────────────────────────────────────────────

  /**
   * Get a packet by ID.
   */
  getPacket(id: PacketId): Packet | undefined {
    const packet = this.packets.get(id);
    return packet ? { ...packet } : undefined;
  }

  /**
   * Check if a packet exists.
   */
  hasPacket(id: PacketId): boolean {
    return this.packets.has(id);
  }

  /**
   * Get all active packets (CREATED or IN_TRANSIT).
   */
  getActivePackets(): Packet[] {
    const active: Packet[] = [];
    for (const packet of this.packets.values()) {
      if (packet.state === 'CREATED' || packet.state === 'IN_TRANSIT') {
        active.push({ ...packet });
      }
    }
    return active;
  }

  /**
   * Get all completed packets (DELIVERED or DROPPED).
   */
  getCompletedPackets(): Packet[] {
    const completed: Packet[] = [];
    for (const packet of this.packets.values()) {
      if (packet.state === 'DELIVERED' || packet.state === 'DROPPED') {
        completed.push({ ...packet });
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
      simulationTime: 0, // TODO: Use simulation tick when available
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
      simulationTime: 0, // TODO: Use simulation tick when available
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
      simulationTime: 0, // TODO: Use simulation tick when available
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
      simulationTime: 0, // TODO: Use simulation tick when available
      wallClockMs: Date.now(),
    };
    this.eventBus.emit(event);
  }
}
