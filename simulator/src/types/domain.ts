/**
 * @file simulator/src/types/domain.ts
 *
 * Core domain types for the simulation engine.
 *
 * These types define the authoritative shape of every network entity.
 * They are intentionally framework-independent — no React, no Express,
 * no database ORM decorators.
 *
 * RULE: Do not import from 'react', 'express', 'pg', or any browser API here.
 */

import type { DeviceId, InterfaceId, LinkId, NetworkId } from './ids.js';

// ─── Enumerations ─────────────────────────────────────────────────────────────

/**
 * The physical/logical type of a simulated network device.
 * Determines default behavior, icon, and supported capabilities.
 */
export type DeviceType = 'PC' | 'ROUTER' | 'SWITCH' | 'SERVER';

/** Operational status of any entity that can fail and recover. */
export type OperationalStatus = 'UP' | 'DOWN' | 'DEGRADED';

/** Simulation lifecycle states. */
export type SimulationStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ERROR';

// ─── Network ──────────────────────────────────────────────────────────────────

/**
 * The top-level container for a network topology.
 * A Network owns devices and links; devices own interfaces.
 */
export interface Network {
  readonly id: NetworkId;
  readonly name: string;
  readonly createdAt: number; // Unix timestamp ms
  readonly devices: ReadonlyMap<DeviceId, Device>;
  readonly links: ReadonlyMap<LinkId, Link>;
}

// ─── Device ───────────────────────────────────────────────────────────────────

/**
 * A simulated network device (PC, Router, Switch, Server).
 * Devices do NOT know about their visual position — that is presentation state
 * owned by the client.
 */
export interface Device {
  readonly id: DeviceId;
  readonly name: string;
  readonly type: DeviceType;
  readonly status: OperationalStatus;
  readonly interfaces: ReadonlyMap<InterfaceId, NetworkInterface>;
}

// ─── Interface ────────────────────────────────────────────────────────────────

/**
 * A network interface belonging to a device.
 * An interface can be connected to exactly one Link endpoint.
 */
export interface NetworkInterface {
  readonly id: InterfaceId;
  readonly deviceId: DeviceId;
  readonly name: string; // e.g., "eth0", "lo"
  readonly macAddress: string; // e.g., "00:1A:2B:3C:4D:5E"
  readonly ipAddress: string | null; // IPv4 dotted-decimal, null if unassigned
  readonly subnetMask: string | null;
  readonly status: OperationalStatus;
  readonly connectedLinkId: LinkId | null;
}

// ─── Link ─────────────────────────────────────────────────────────────────────

/**
 * A simulated network link (cable / virtual connection) between two interfaces.
 *
 * Note: Links connect interfaces, not devices directly.
 * A device with multiple interfaces can have multiple links.
 */
export interface Link {
  readonly id: LinkId;
  readonly endpointA: InterfaceId;
  readonly endpointB: InterfaceId;
  readonly status: OperationalStatus;
  /** Bandwidth in bits per second. null = unconstrained (future simulation use). */
  readonly bandwidthBps: number | null;
  /** Propagation delay in milliseconds (future simulation use). */
  readonly delayMs: number;
  /** Packet loss probability 0.0–1.0 (future simulation use). */
  readonly lossRate: number;
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export interface SimulationConfig {
  readonly networkId: NetworkId;
  /** Tick interval in ms for the discrete event loop. 0 = as-fast-as-possible. */
  readonly tickMs: number;
  /**
   * Random seed for deterministic simulation.
   * Future: pass this into a seeded PRNG rather than Math.random().
   */
  readonly seed: number;
}
