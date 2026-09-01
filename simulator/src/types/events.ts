/**
 * @file simulator/src/types/events.ts
 *
 * Simulation event types — the vocabulary of things that actually happened.
 *
 * KEY ARCHITECTURAL RULE:
 *   Events are facts about the past. Commands are requests for the future.
 *   These types capture the event side of the command/event distinction.
 *
 * Events are emitted by the simulator and consumed by:
 *   - the server (to broadcast via WebSocket)
 *   - the persistence layer (to store simulation history)
 *   - the test layer (to verify simulator behavior)
 *
 * Events must be serializable to plain JSON. No class instances, no functions,
 * no circular references.
 */

import type { DeviceId, EventId, InterfaceId, LinkId, PacketId, SimulationId } from './ids.js';

// ─── Event Base ───────────────────────────────────────────────────────────────

interface BaseEvent {
  readonly id: EventId;
  readonly type: SimulationEventType;
  /** Simulation-internal logical time (tick count), NOT wall-clock time. */
  readonly simulationTime: number;
  /** Wall-clock timestamp for logging and display purposes. */
  readonly wallClockMs: number;
}

// ─── Event Type Discriminant ──────────────────────────────────────────────────

export type SimulationEventType =
  // Topology
  | 'DEVICE_CREATED'
  | 'DEVICE_REMOVED'
  | 'DEVICE_UPDATED'
  | 'LINK_CREATED'
  | 'LINK_REMOVED'
  | 'LINK_UPDATED'
  // Operational status
  | 'NODE_FAILED'
  | 'NODE_RECOVERED'
  | 'LINK_FAILED'
  | 'LINK_RECOVERED'
  // Routing (future)
  | 'ROUTE_CHANGED'
  // Packets (future)
  | 'PACKET_CREATED'
  | 'PACKET_FORWARDED'
  | 'PACKET_DELIVERED'
  | 'PACKET_DROPPED'
  // Simulation lifecycle
  | 'SIMULATION_STARTED'
  | 'SIMULATION_PAUSED'
  | 'SIMULATION_RESUMED'
  | 'SIMULATION_COMPLETED'
  | 'SIMULATION_ERROR';

// ─── Concrete Event Types ─────────────────────────────────────────────────────

export interface DeviceCreatedEvent extends BaseEvent {
  readonly type: 'DEVICE_CREATED';
  readonly deviceId: DeviceId;
  readonly deviceName: string;
}

export interface DeviceRemovedEvent extends BaseEvent {
  readonly type: 'DEVICE_REMOVED';
  readonly deviceId: DeviceId;
}

export interface LinkCreatedEvent extends BaseEvent {
  readonly type: 'LINK_CREATED';
  readonly linkId: LinkId;
  readonly endpointA: InterfaceId;
  readonly endpointB: InterfaceId;
}

export interface LinkRemovedEvent extends BaseEvent {
  readonly type: 'LINK_REMOVED';
  readonly linkId: LinkId;
}

export interface NodeFailedEvent extends BaseEvent {
  readonly type: 'NODE_FAILED';
  readonly deviceId: DeviceId;
}

export interface NodeRecoveredEvent extends BaseEvent {
  readonly type: 'NODE_RECOVERED';
  readonly deviceId: DeviceId;
}

export interface LinkFailedEvent extends BaseEvent {
  readonly type: 'LINK_FAILED';
  readonly linkId: LinkId;
}

export interface LinkRecoveredEvent extends BaseEvent {
  readonly type: 'LINK_RECOVERED';
  readonly linkId: LinkId;
}

export interface PacketCreatedEvent extends BaseEvent {
  readonly type: 'PACKET_CREATED';
  readonly packetId: PacketId;
  readonly sourceDeviceId: DeviceId;
  readonly destinationDeviceId: DeviceId;
}

export interface PacketForwardedEvent extends BaseEvent {
  readonly type: 'PACKET_FORWARDED';
  readonly packetId: PacketId;
  readonly atDeviceId: DeviceId;
  readonly viaLinkId: LinkId;
}

export interface PacketDeliveredEvent extends BaseEvent {
  readonly type: 'PACKET_DELIVERED';
  readonly packetId: PacketId;
  readonly destinationDeviceId: DeviceId;
}

export interface PacketDroppedEvent extends BaseEvent {
  readonly type: 'PACKET_DROPPED';
  readonly packetId: PacketId;
  readonly atDeviceId: DeviceId;
  readonly reason: string;
}

export interface SimulationStartedEvent extends BaseEvent {
  readonly type: 'SIMULATION_STARTED';
  readonly simulationId: SimulationId;
}

export interface SimulationPausedEvent extends BaseEvent {
  readonly type: 'SIMULATION_PAUSED';
  readonly simulationId: SimulationId;
}

export interface SimulationCompletedEvent extends BaseEvent {
  readonly type: 'SIMULATION_COMPLETED';
  readonly simulationId: SimulationId;
}

/**
 * Discriminated union of all simulation events.
 * Add new event types here as the simulator grows.
 */
export type SimulationEvent =
  | DeviceCreatedEvent
  | DeviceRemovedEvent
  | LinkCreatedEvent
  | LinkRemovedEvent
  | NodeFailedEvent
  | NodeRecoveredEvent
  | LinkFailedEvent
  | LinkRecoveredEvent
  | PacketCreatedEvent
  | PacketForwardedEvent
  | PacketDeliveredEvent
  | PacketDroppedEvent
  | SimulationStartedEvent
  | SimulationPausedEvent
  | SimulationCompletedEvent;
