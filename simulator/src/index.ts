/**
 * @file simulator/src/index.ts
 *
 * Public API of the @mini-internet/simulator package.
 *
 * RULE: Only export things that consumers (server, tests) actually need.
 *       Keep internal implementation details unexported.
 *
 * Consumers should import from '@mini-internet/simulator', not from
 * deep internal paths.
 */

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  Network,
  Device,
  NetworkInterface,
  Link,
  DeviceType,
  OperationalStatus,
  SimulationStatus,
  SimulationConfig,
} from './types/domain.js';

export type {
  NetworkId,
  DeviceId,
  InterfaceId,
  LinkId,
  PacketId,
  SimulationId,
  EventId,
} from './types/ids.js';

export { IdFactory } from './types/ids.js';

// ── Events ────────────────────────────────────────────────────────────────────
export type { SimulationEvent, SimulationEventType } from './types/events.js';

// ── Commands ──────────────────────────────────────────────────────────────────
export type { SimulationCommand, CommandType } from './types/commands.js';

// ── Errors ────────────────────────────────────────────────────────────────────
export { SimulatorError, ok, err } from './types/errors.js';
export type { Result, SimulatorErrorCode } from './types/errors.js';

// ── Network graph ─────────────────────────────────────────────────────────────
export { NetworkGraph } from './network/NetworkGraph.js';

// ── Event bus ─────────────────────────────────────────────────────────────────
export { EventBus } from './events/EventBus.js';

// ── Routing ───────────────────────────────────────────────────────────────────
export type {
  RoutingAlgorithm,
  RoutingAlgorithmName,
  Route,
  RouteHop,
} from './routing/RoutingAlgorithm.js';
export { RoutingAlgorithmRegistry } from './routing/RoutingAlgorithm.js';

// ── Simulation engine ─────────────────────────────────────────────────────────
export { SimulationEngine } from './simulation/SimulationEngine.js';

// ── Network primitives ────────────────────────────────────────────────────────
export { MACAddress } from './network/MACAddress.js';
export { IPv4Address } from './network/ipv4/IPv4Address.js';
export { IPv4Subnet } from './network/ipv4/IPv4Subnet.js';

// ── Device factory ────────────────────────────────────────────────────────────
export { DeviceFactory } from './devices/DeviceFactory.js';
export type {
  DeviceCreationOptions,
  PcCreationOptions,
  RouterCreationOptions,
  ServerCreationOptions,
  PcOrServerCreationResult,
  RouterCreationResult,
} from './devices/DeviceFactory.js';

// ── Packet engine ─────────────────────────────────────────────────────────────
export { PacketEngine, PacketFactory, isValidPacketDropReason } from './packets/index.js';
export type {
  Packet,
  PacketState,
  CreatePacketOptions,
  PacketDropReason,
} from './packets/index.js';

// ── Logging ───────────────────────────────────────────────────────────────────
export type { Logger, LogLevel } from './core/logger.js';
export { createLogger, SilentLogger } from './core/logger.js';
