/**
 * @file simulator/src/devices/DeviceFactory.ts
 *
 * Device factory providing controlled, validated creation of network devices.
 *
 * DESIGN NOTES:
 *   - DeviceFactory is a thin, stateless facade over NetworkGraph mutations.
 *   - All state lives in the NetworkGraph (single source of truth).
 *   - The factory prevents accidental creation of invalid/partial devices.
 *   - Device types PC, ROUTER, and SERVER are the supported initial set.
 *   - Creation logic is centralized here to avoid duplicating validation.
 *
 * DEVICE DEFAULTS:
 *   PC     → loopback (lo) + eth0
 *   SERVER → loopback (lo) + eth0
 *   ROUTER → loopback (lo) only  (eth interfaces added explicitly)
 *
 * ROUTER RATIONALE:
 *   Routers need multiple ethernet interfaces on distinct networks.
 *   Adding eth0 automatically could mislead callers into thinking one
 *   interface is sufficient. The caller must add interfaces explicitly.
 */

import type { DeviceId, InterfaceId } from '../types/ids.js';
import type { DeviceType } from '../types/domain.js';
import { type Result, err } from '../types/errors.js';
import type { NetworkGraph } from '../network/NetworkGraph.js';

// ─── DeviceCreationOptions ────────────────────────────────────────────────────

/**
 * Options for generic device creation via `DeviceFactory.createDevice()`.
 */
export interface DeviceCreationOptions {
  /** Human-readable device name — must be unique within the network. */
  readonly name: string;
  /** Device type; must be one of the supported initial types. */
  readonly type: DeviceType;
}

/**
 * Options for creating a PC.
 * A PC is an end-user device with at least one ethernet interface (eth0).
 */
export interface PcCreationOptions {
  readonly name: string;
}

/**
 * Options for creating a Router.
 * A Router starts with only a loopback interface.
 * Ethernet interfaces must be added via `graph.addInterface()`.
 */
export interface RouterCreationOptions {
  readonly name: string;
}

/**
 * Options for creating a Server.
 * A Server behaves like a PC in terms of interface defaults.
 */
export interface ServerCreationOptions {
  readonly name: string;
}

// ─── DeviceCreationResult ─────────────────────────────────────────────────────

/**
 * Result returned after creating a PC or Server.
 * Provides the device ID and the IDs of the automatically created interfaces.
 */
export interface PcOrServerCreationResult {
  readonly deviceId: DeviceId;
  /** The loopback interface ID. */
  readonly loopbackId: InterfaceId;
  /** The eth0 interface ID. */
  readonly eth0Id: InterfaceId;
}

/**
 * Result returned after creating a Router.
 * Provides only the device ID and loopback ID.
 * Ethernet interface IDs are returned from subsequent `addInterface()` calls.
 */
export interface RouterCreationResult {
  readonly deviceId: DeviceId;
  /** The loopback interface ID. */
  readonly loopbackId: InterfaceId;
}

// ─── DeviceFactory ────────────────────────────────────────────────────────────

/**
 * Stateless factory for creating network devices.
 *
 * The factory delegates all mutations to the NetworkGraph, which is the
 * single source of truth. This class exists to:
 *   1. Document the default interface scheme for each device type.
 *   2. Provide typed creation results (including auto-created interface IDs).
 *   3. Enforce that callers cannot accidentally create partial/invalid devices.
 *
 * USAGE:
 * ```typescript
 * const factory = new DeviceFactory(graph);
 * const result = factory.createPc({ name: 'PC-1' });
 * if (result.ok) {
 *   console.log(result.value.deviceId);
 *   console.log(result.value.eth0Id);
 * }
 * ```
 */
export class DeviceFactory {
  constructor(private readonly graph: NetworkGraph) {}

  // ── PC ──────────────────────────────────────────────────────────────────────

  /**
   * Create a PC with default interfaces (loopback + eth0).
   *
   * Defaults:
   * - lo  → 00:00:00:00:00:00, 127.0.0.1/8 (loopback)
   * - eth0 → auto-generated locally-administered MAC, no IP
   *
   * @returns Ok with device and interface IDs, or Err on validation failure.
   */
  createPc(options: PcCreationOptions): Result<PcOrServerCreationResult> {
    return this._createEndpointDevice(options.name, 'PC');
  }

  // ── Server ──────────────────────────────────────────────────────────────────

  /**
   * Create a Server with default interfaces (loopback + eth0).
   *
   * Defaults mirror PC; servers are distinguished only by type.
   *
   * @returns Ok with device and interface IDs, or Err on validation failure.
   */
  createServer(options: ServerCreationOptions): Result<PcOrServerCreationResult> {
    return this._createEndpointDevice(options.name, 'SERVER');
  }

  // ── Router ──────────────────────────────────────────────────────────────────

  /**
   * Create a Router with only a loopback interface.
   *
   * Rationale: routers are multi-interface devices. The caller must add
   * ethernet interfaces explicitly via `graph.addInterface()`, choosing
   * meaningful names like eth0, eth1, eth2 for each network segment.
   *
   * @returns Ok with device and loopback interface IDs, or Err on failure.
   */
  createRouter(options: RouterCreationOptions): Result<RouterCreationResult> {
    const addResult = this.graph.addRouter(options.name);
    if (!addResult.ok) return addResult;

    const deviceId = addResult.value;
    const device = this.graph.getDevice(deviceId);
    if (!device) {
      return err(
        'INTERNAL_ERROR',
        `DeviceFactory: router ${deviceId} not found immediately after creation`,
      );
    }

    // After addRouter(), only the loopback interface exists.
    const loopbackEntry = Array.from(device.interfaces.values()).find((i) => i.name === 'lo');
    if (!loopbackEntry) {
      return err(
        'INTERNAL_ERROR',
        `DeviceFactory: loopback interface not found on router ${deviceId}`,
      );
    }

    return {
      ok: true,
      value: {
        deviceId,
        loopbackId: loopbackEntry.id,
      },
    };
  }

  // ── Generic ─────────────────────────────────────────────────────────────────

  /**
   * Generic device creation.
   * Use the typed helpers (createPc, createRouter, createServer) when possible.
   *
   * Supported types: PC, ROUTER, SERVER.
   * Note: SWITCH is in the domain type for future use but is not yet an
   * initial supported device in this phase.
   *
   * @returns Ok with DeviceId, or Err on validation failure.
   */
  createDevice(options: DeviceCreationOptions): Result<DeviceId> {
    switch (options.type) {
      case 'PC':
        return this.graph.addPc(options.name);
      case 'ROUTER':
        return this.graph.addRouter(options.name);
      case 'SERVER':
        return this.graph.addServer(options.name);
      case 'SWITCH':
        // SWITCH is reserved for future phases.
        return err('INVALID_COMMAND', `Device type SWITCH is not yet supported in this phase.`);
      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = options.type;
        return err('INVALID_COMMAND', `Unknown device type: ${_exhaustive as string}`);
      }
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  /**
   * Shared logic for PC and Server creation (both get loopback + eth0).
   */
  private _createEndpointDevice(
    name: string,
    type: 'PC' | 'SERVER',
  ): Result<PcOrServerCreationResult> {
    const addResult = type === 'PC' ? this.graph.addPc(name) : this.graph.addServer(name);
    if (!addResult.ok) return addResult;

    const deviceId = addResult.value;
    const device = this.graph.getDevice(deviceId);
    if (!device) {
      return err(
        'INTERNAL_ERROR',
        `DeviceFactory: ${type} ${deviceId} not found immediately after creation`,
      );
    }

    const interfaces = Array.from(device.interfaces.values());
    const loopbackEntry = interfaces.find((i) => i.name === 'lo');
    const eth0Entry = interfaces.find((i) => i.name === 'eth0');

    if (!loopbackEntry) {
      return err(
        'INTERNAL_ERROR',
        `DeviceFactory: loopback interface not found on ${type} ${deviceId}`,
      );
    }
    if (!eth0Entry) {
      return err(
        'INTERNAL_ERROR',
        `DeviceFactory: eth0 interface not found on ${type} ${deviceId}`,
      );
    }

    return {
      ok: true,
      value: {
        deviceId,
        loopbackId: loopbackEntry.id,
        eth0Id: eth0Entry.id,
      },
    };
  }
}
