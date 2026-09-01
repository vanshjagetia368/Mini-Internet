/**
 * @file simulator/src/network/NetworkGraph.ts
 *
 * The authoritative, mutable network state container.
 *
 * ARCHITECTURAL RULE:
 *   This class is the single source of truth for network topology.
 *   React Flow's node/edge arrays are a READ-ONLY MIRROR of this graph.
 *   All mutations go through this class; React re-renders from emitted events.
 *
 * DESIGN NOTES:
 *   - Internally mutable (Map) for efficiency during simulation.
 *   - Exposes readonly views (via getters) to prevent external mutation.
 *   - Emits events to the EventBus after every successful mutation.
 *
 * CURRENT STATE: Core CRUD operations implemented. Routing, failure injection,
 * and packet state will be added in later phases.
 */

import type { DeviceId, InterfaceId, LinkId, NetworkId } from '../types/ids.js';
import type { Device, DeviceType, Link, Network, NetworkInterface, OperationalStatus } from '../types/domain.js';
import { type Result, ok, err } from '../types/errors.js';
import { IdFactory } from '../types/ids.js';
import type { EventBus } from '../events/EventBus.js';
import { MACAddress } from './MACAddress.js';

// ─── Internal Mutable Device ─────────────────────────────────────────────────

// We keep mutable internal versions separately from the readonly external types.
// This way external consumers never accidentally mutate simulator state.

interface MutableInterface {
  id: InterfaceId;
  deviceId: DeviceId;
  name: string;
  macAddress: string;
  ipAddress: string | null;
  subnetMask: string | null;
  status: OperationalStatus;
  connectedLinkId: LinkId | null;
}

interface MutableDevice {
  id: DeviceId;
  name: string;
  type: DeviceType;
  status: OperationalStatus;
  interfaces: Map<InterfaceId, MutableInterface>;
}

interface MutableLink {
  id: LinkId;
  endpointA: InterfaceId;
  endpointB: InterfaceId;
  status: OperationalStatus;
  bandwidthBps: number | null;
  delayMs: number;
  lossRate: number;
}

// ─── NetworkGraph ─────────────────────────────────────────────────────────────

export class NetworkGraph {
  private readonly _id: NetworkId;
  private readonly _name: string;
  private readonly _createdAt: number;
  private readonly _devices = new Map<DeviceId, MutableDevice>();
  private readonly _links = new Map<LinkId, MutableLink>();
  private _simulationTick = 0;

  constructor(
    id: NetworkId,
    name: string,
    private readonly eventBus: EventBus,
  ) {
    this._id = id;
    this._name = name;
    this._createdAt = Date.now();
  }

  // ── Read-only snapshot ──────────────────────────────────────────────────────

  /**
   * Returns a frozen snapshot of the current network state.
   * This snapshot is safe to pass to routing algorithms and to serialize.
   *
   * NOTE: This creates new Map objects — it is not free. Call only when
   * a full snapshot is actually needed (e.g., serialization, routing input).
   * For hot-path queries, use the individual getter methods below.
   */
  snapshot(): Network {
    const devices = new Map<DeviceId, Device>();
    for (const [id, d] of this._devices) {
      const interfaces = new Map<InterfaceId, NetworkInterface>();
      for (const [ifId, iface] of d.interfaces) {
        interfaces.set(ifId, { ...iface });
      }
      devices.set(id, { ...d, interfaces });
    }

    const links = new Map<LinkId, Link>();
    for (const [id, l] of this._links) {
      links.set(id, { ...l });
    }

    return {
      id: this._id,
      name: this._name,
      createdAt: this._createdAt,
      devices,
      links,
    };
  }

  get id(): NetworkId { return this._id; }
  get name(): string { return this._name; }

  getDevice(id: DeviceId): Device | undefined {
    const d = this._devices.get(id);
    if (!d) return undefined;
    const interfaces = new Map<InterfaceId, NetworkInterface>();
    for (const [ifId, iface] of d.interfaces) {
      interfaces.set(ifId, { ...iface });
    }
    return { ...d, interfaces };
  }

  getLink(id: LinkId): Link | undefined {
    const l = this._links.get(id);
    return l ? { ...l } : undefined;
  }

  deviceIds(): DeviceId[] {
    return Array.from(this._devices.keys());
  }

  linkIds(): LinkId[] {
    return Array.from(this._links.keys());
  }

  /**
   * Resolves the immediate neighbors of a device.
   * Returns an array of objects containing the neighbor device ID, the connecting link,
   * the local interface, and the neighbor's interface.
   * Ordering is deterministic based on the order interfaces were created.
   */
  getNeighbors(deviceId: DeviceId): Array<{
    deviceId: DeviceId;
    link: Link;
    localInterface: NetworkInterface;
    remoteInterface: NetworkInterface;
  }> {
    const device = this._devices.get(deviceId);
    if (!device) return [];

    const neighbors: Array<{
      deviceId: DeviceId;
      link: Link;
      localInterface: NetworkInterface;
      remoteInterface: NetworkInterface;
    }> = [];

    for (const iface of device.interfaces.values()) {
      if (!iface.connectedLinkId) continue;

      const link = this._links.get(iface.connectedLinkId);
      if (!link) continue;

      // Determine which endpoint is the remote one
      const isEndpointA = link.endpointA === iface.id;
      const remoteInterfaceId = isEndpointA ? link.endpointB : link.endpointA;

      const remoteInterface = this._findInterface(remoteInterfaceId);
      if (!remoteInterface) continue;

      neighbors.push({
        deviceId: remoteInterface.deviceId,
        link: { ...link },
        localInterface: { ...iface },
        remoteInterface: { ...remoteInterface },
      });
    }

    return neighbors;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  addPc(name: string): Result<DeviceId> {
    const res = this.addDevice(name, 'PC');
    if (res.ok) this.addInterface(res.value, 'eth0');
    return res;
  }

  addServer(name: string): Result<DeviceId> {
    const res = this.addDevice(name, 'SERVER');
    if (res.ok) this.addInterface(res.value, 'eth0');
    return res;
  }

  addRouter(name: string): Result<DeviceId> {
    return this.addDevice(name, 'ROUTER');
  }

  /**
   * Add a new device to the network.
   * Automatically creates a default loopback interface.
   */
  addDevice(name: string, type: DeviceType): Result<DeviceId> {
    const id = IdFactory.device();
    const loopbackId = IdFactory.interface();

    const loopback: MutableInterface = {
      id: loopbackId,
      deviceId: id,
      name: 'lo',
      macAddress: '00:00:00:00:00:00',
      ipAddress: '127.0.0.1',
      subnetMask: '255.0.0.0',
      status: 'UP',
      connectedLinkId: null,
    };

    const device: MutableDevice = {
      id,
      name,
      type,
      status: 'UP',
      interfaces: new Map([[loopbackId, loopback]]),
    };

    this._devices.set(id, device);

    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'DEVICE_CREATED',
      deviceId: id,
      deviceName: name,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });

    return ok(id);
  }

  /**
   * Remove a device and all links connected to its interfaces.
   */
  removeDevice(id: DeviceId): Result<void> {
    const device = this._devices.get(id);
    if (!device) {
      return err('ENTITY_NOT_FOUND', `Device ${id} not found`);
    }

    // Remove all links connected to this device's interfaces
    for (const iface of device.interfaces.values()) {
      if (iface.connectedLinkId) {
        this._removeLink(iface.connectedLinkId);
      }
    }

    this._devices.delete(id);

    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'DEVICE_REMOVED',
      deviceId: id,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });

    return ok(undefined);
  }

  /**
   * Add an interface to an existing device.
   * If macAddress is not provided, one is generated automatically.
   */
  addInterface(deviceId: DeviceId, name: string, macAddress?: string): Result<InterfaceId> {
    const device = this._devices.get(deviceId);
    if (!device) {
      return err('ENTITY_NOT_FOUND', `Device ${deviceId} not found`);
    }

    for (const iface of device.interfaces.values()) {
      if (iface.name === name) {
        return err('DUPLICATE_INTERFACE', `Interface ${name} already exists on device ${deviceId}`);
      }
    }

    let finalMacAddress: string;
    if (macAddress) {
      const macResult = MACAddress.create(macAddress);
      if (!macResult.ok) return macResult;
      finalMacAddress = macResult.value.toString();
    } else {
      finalMacAddress = MACAddress.generateLocal().toString();
    }

    const id = IdFactory.interface();
    const iface: MutableInterface = {
      id,
      deviceId,
      name,
      macAddress: finalMacAddress,
      ipAddress: null,
      subnetMask: null,
      status: 'UP',
      connectedLinkId: null,
    };
    device.interfaces.set(id, iface);

    return ok(id);
  }

  /**
   * Connect two interfaces with a new link.
   * Fails if either interface is already connected to another link.
   */
  addLink(
    endpointA: InterfaceId,
    endpointB: InterfaceId,
    options: { bandwidthBps?: number; delayMs?: number; lossRate?: number } = {},
  ): Result<LinkId> {
    const ifaceA = this._findInterface(endpointA);
    const ifaceB = this._findInterface(endpointB);

    if (!ifaceA) return err('ENTITY_NOT_FOUND', `Interface ${endpointA} not found`);
    if (!ifaceB) return err('ENTITY_NOT_FOUND', `Interface ${endpointB} not found`);
    if (ifaceA.connectedLinkId) return err('INVALID_TOPOLOGY', `Interface ${endpointA} already connected`);
    if (ifaceB.connectedLinkId) return err('INVALID_TOPOLOGY', `Interface ${endpointB} already connected`);
    if (endpointA === endpointB) return err('INVALID_TOPOLOGY', 'Cannot connect interface to itself');

    const id = IdFactory.link();
    const link: MutableLink = {
      id,
      endpointA,
      endpointB,
      status: 'UP',
      bandwidthBps: options.bandwidthBps ?? null,
      delayMs: options.delayMs ?? 0,
      lossRate: options.lossRate ?? 0,
    };

    this._links.set(id, link);
    ifaceA.connectedLinkId = id;
    ifaceB.connectedLinkId = id;

    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'LINK_CREATED',
      linkId: id,
      endpointA,
      endpointB,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });

    return ok(id);
  }

  /**
   * Remove a link by ID.
   */
  removeLink(id: LinkId): Result<void> {
    if (!this._links.has(id)) {
      return err('ENTITY_NOT_FOUND', `Link ${id} not found`);
    }
    this._removeLink(id);
    return ok(undefined);
  }

  // ── Failure injection ─────────────────────────────────────────────────────

  failDevice(id: DeviceId): Result<void> {
    const device = this._devices.get(id);
    if (!device) return err('ENTITY_NOT_FOUND', `Device ${id} not found`);
    device.status = 'DOWN';
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'NODE_FAILED',
      deviceId: id,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });
    return ok(undefined);
  }

  recoverDevice(id: DeviceId): Result<void> {
    const device = this._devices.get(id);
    if (!device) return err('ENTITY_NOT_FOUND', `Device ${id} not found`);
    device.status = 'UP';
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'NODE_RECOVERED',
      deviceId: id,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });
    return ok(undefined);
  }

  failLink(id: LinkId): Result<void> {
    const link = this._links.get(id);
    if (!link) return err('ENTITY_NOT_FOUND', `Link ${id} not found`);
    link.status = 'DOWN';
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'LINK_FAILED',
      linkId: id,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });
    return ok(undefined);
  }

  recoverLink(id: LinkId): Result<void> {
    const link = this._links.get(id);
    if (!link) return err('ENTITY_NOT_FOUND', `Link ${id} not found`);
    link.status = 'UP';
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'LINK_RECOVERED',
      linkId: id,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });
    return ok(undefined);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _findInterface(id: InterfaceId): MutableInterface | undefined {
    for (const device of this._devices.values()) {
      const iface = device.interfaces.get(id);
      if (iface) return iface;
    }
    return undefined;
  }

  private _removeLink(id: LinkId): void {
    const link = this._links.get(id);
    if (!link) return;

    // Detach from interfaces
    const ifaceA = this._findInterface(link.endpointA);
    const ifaceB = this._findInterface(link.endpointB);
    if (ifaceA) ifaceA.connectedLinkId = null;
    if (ifaceB) ifaceB.connectedLinkId = null;

    this._links.delete(id);

    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'LINK_REMOVED',
      linkId: id,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });
  }

  /** Advance the logical simulation clock. Called by the simulation loop. */
  advanceTick(): void {
    this._simulationTick++;
  }
}
