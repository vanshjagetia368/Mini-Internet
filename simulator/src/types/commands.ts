/**
 * @file simulator/src/types/commands.ts
 *
 * Command types — the vocabulary of requested actions sent TO the simulator.
 *
 * ARCHITECTURAL RULE:
 *   Commands are requests. The simulator validates and executes them.
 *   A command may succeed (producing one or more events) or fail (returning an error).
 *   Commands must never assume success — the simulator decides.
 *
 * Command DTOs should be serializable to JSON so they can cross the
 * HTTP/WebSocket boundary from the client → server → simulator.
 */

import type { DeviceId, InterfaceId, LinkId, SimulationId } from './ids.js';
import type { DeviceType } from './domain.js';

// ─── Command Discriminant ─────────────────────────────────────────────────────

export type CommandType =
  // Topology
  | 'CREATE_DEVICE'
  | 'REMOVE_DEVICE'
  | 'UPDATE_DEVICE'
  | 'CREATE_LINK'
  | 'REMOVE_LINK'
  | 'UPDATE_LINK'
  // Interface configuration
  | 'SET_INTERFACE_IP'
  // Operational
  | 'FAIL_NODE'
  | 'RECOVER_NODE'
  | 'FAIL_LINK'
  | 'RECOVER_LINK'
  // Packets (future)
  | 'SEND_PACKET'
  // Simulation lifecycle
  | 'START_SIMULATION'
  | 'PAUSE_SIMULATION'
  | 'RESUME_SIMULATION'
  | 'STOP_SIMULATION';

// ─── Concrete Command Types ───────────────────────────────────────────────────

export interface CreateDeviceCommand {
  readonly type: 'CREATE_DEVICE';
  readonly name: string;
  readonly deviceType: DeviceType;
}

export interface RemoveDeviceCommand {
  readonly type: 'REMOVE_DEVICE';
  readonly deviceId: DeviceId;
}

export interface UpdateDeviceCommand {
  readonly type: 'UPDATE_DEVICE';
  readonly deviceId: DeviceId;
  readonly name?: string;
}

export interface CreateLinkCommand {
  readonly type: 'CREATE_LINK';
  readonly endpointA: InterfaceId;
  readonly endpointB: InterfaceId;
  readonly bandwidthBps?: number;
  readonly delayMs?: number;
  readonly lossRate?: number;
}

export interface RemoveLinkCommand {
  readonly type: 'REMOVE_LINK';
  readonly linkId: LinkId;
}

export interface SetInterfaceIpCommand {
  readonly type: 'SET_INTERFACE_IP';
  readonly interfaceId: InterfaceId;
  readonly ipAddress: string;
  readonly subnetMask: string;
}

export interface FailNodeCommand {
  readonly type: 'FAIL_NODE';
  readonly deviceId: DeviceId;
}

export interface RecoverNodeCommand {
  readonly type: 'RECOVER_NODE';
  readonly deviceId: DeviceId;
}

export interface FailLinkCommand {
  readonly type: 'FAIL_LINK';
  readonly linkId: LinkId;
}

export interface RecoverLinkCommand {
  readonly type: 'RECOVER_LINK';
  readonly linkId: LinkId;
}

export interface StartSimulationCommand {
  readonly type: 'START_SIMULATION';
  readonly simulationId: SimulationId;
  readonly seed?: number;
}

export interface PauseSimulationCommand {
  readonly type: 'PAUSE_SIMULATION';
  readonly simulationId: SimulationId;
}

export interface ResumeSimulationCommand {
  readonly type: 'RESUME_SIMULATION';
  readonly simulationId: SimulationId;
}

export interface StopSimulationCommand {
  readonly type: 'STOP_SIMULATION';
  readonly simulationId: SimulationId;
}

export interface SendPacketCommand {
  readonly type: 'SEND_PACKET';
  readonly sourceDeviceId: DeviceId;
  readonly destinationDeviceId: DeviceId;
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly payload: string;
}

export interface UpdateLinkCommand {
  readonly type: 'UPDATE_LINK';
  readonly linkId: LinkId;
  readonly bandwidthBps?: number;
  readonly delayMs?: number;
  readonly lossRate?: number;
}

/**
 * Discriminated union of all commands.
 */
export type SimulationCommand =
  | CreateDeviceCommand
  | RemoveDeviceCommand
  | UpdateDeviceCommand
  | CreateLinkCommand
  | RemoveLinkCommand
  | UpdateLinkCommand
  | SetInterfaceIpCommand
  | FailNodeCommand
  | RecoverNodeCommand
  | FailLinkCommand
  | RecoverLinkCommand
  | SendPacketCommand
  | StartSimulationCommand
  | PauseSimulationCommand
  | ResumeSimulationCommand
  | StopSimulationCommand;
