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
import type {
  Device,
  DeviceType,
  Link,
  Network,
  NetworkInterface,
  OperationalStatus,
} from '../types/domain.js';
import { type Result, ok, err } from '../types/errors.js';
import { IdFactory } from '../types/ids.js';
import type { EventBus } from '../events/EventBus.js';
import { MACAddress } from './MACAddress.js';
import { IPv4Address } from './ipv4/IPv4Address.js';
import { IPv4Subnet } from './ipv4/IPv4Subnet.js';

// ─── Internal Mutable Device ─────────────────────────────────────────────────

// We keep mutable internal versions separately from the readonly external types.
// This way external consumers never accidentally mutate simulator state.

interface MutableInterface {
  id: InterfaceId;
  deviceId: DeviceId;
  name: string;
  macAddress: string;
  ipAddress: string | null;
  prefixLength: number | null;
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

  get id(): NetworkId {
    return this._id;
  }
  get name(): string {
    return this._name;
  }

  getDevice(id: DeviceId): Device | undefined {
    const d = this._devices.get(id);
    if (!d) return undefined;
    const interfaces = new Map<InterfaceId, NetworkInterface>();
    for (const [ifId, iface] of d.interfaces) {
      interfaces.set(ifId, { ...iface });
    }
    return { ...d, interfaces };
  }

  hasDevice(id: DeviceId): boolean {
    return this._devices.has(id);
  }

  getLink(id: LinkId): Link | undefined {
    const l = this._links.get(id);
    return l ? { ...l } : undefined;
  }

  hasLink(id: LinkId): boolean {
    return this._links.has(id);
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

  /**
   * Returns all links connected to any interface on the given device.
   */
  getConnectedLinks(deviceId: DeviceId): Link[] {
    const device = this._devices.get(deviceId);
    if (!device) return [];

    const links: Link[] = [];
    for (const iface of device.interfaces.values()) {
      if (!iface.connectedLinkId) continue;
      const link = this._links.get(iface.connectedLinkId);
      if (link) links.push({ ...link });
    }
    return links;
  }

  /**
   * Returns the first link found connecting the two devices.
   */
  getLinkBetween(deviceA: DeviceId, deviceB: DeviceId): Link | undefined {
    const neighbors = this.getNeighbors(deviceA);
    for (const n of neighbors) {
      if (n.deviceId === deviceB) {
        return n.link;
      }
    }
    return undefined;
  }

  /**
   * Lookup device by name.
   * Returns the first device with the given name, or undefined if not found.
   */
  getDeviceByName(name: string): Device | undefined {
    for (const device of this._devices.values()) {
      if (device.name === name) {
        const interfaces = new Map<InterfaceId, NetworkInterface>();
        for (const [ifId, iface] of device.interfaces) {
          interfaces.set(ifId, { ...iface });
        }
        return { ...device, interfaces };
      }
    }
    return undefined;
  }

  /**
   * Get all devices of a specific type.
   */
  getDevicesByType(type: DeviceType): Device[] {
    const devices: Device[] = [];
    for (const [id, d] of this._devices) {
      if (d.type === type) {
        const interfaces = new Map<InterfaceId, NetworkInterface>();
        for (const [ifId, iface] of d.interfaces) {
          interfaces.set(ifId, { ...iface });
        }
        devices.push({ ...d, interfaces });
      }
    }
    return devices;
  }

  /**
   * Get all routers in the network.
   */
  getRouters(): Device[] {
    return this.getDevicesByType('ROUTER');
  }

  /**
   * Get all PCs in the network.
   */
  getPcs(): Device[] {
    return this.getDevicesByType('PC');
  }

  /**
   * Get all servers in the network.
   */
  getServers(): Device[] {
    return this.getDevicesByType('SERVER');
  }

  /**
   * Get a specific interface from a device.
   */
  getInterface(deviceId: DeviceId, interfaceId: InterfaceId): NetworkInterface | undefined {
    const device = this._devices.get(deviceId);
    if (!device) return undefined;

    const iface = device.interfaces.get(interfaceId);
    if (!iface) return undefined;

    return { ...iface };
  }

  /**
   * Check if a device has a specific interface.
   */
  hasInterface(deviceId: DeviceId, interfaceId: InterfaceId): boolean {
    const device = this._devices.get(deviceId);
    if (!device) return false;
    return device.interfaces.has(interfaceId);
  }

  /**
   * Get all interfaces for a device.
   */
  getInterfaces(deviceId: DeviceId): NetworkInterface[] {
    const device = this._devices.get(deviceId);
    if (!device) return [];

    const interfaces: NetworkInterface[] = [];
    for (const [ifId, iface] of device.interfaces) {
      interfaces.push({ ...iface });
    }
    return interfaces;
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
    // Check for duplicate device names
    for (const device of this._devices.values()) {
      if (device.name === name) {
        return err('DUPLICATE_ENTITY', `Device with name '${name}' already exists`);
      }
    }

    const id = IdFactory.device();
    const loopbackId = IdFactory.interface();

    const loopback: MutableInterface = {
      id: loopbackId,
      deviceId: id,
      name: 'lo',
      macAddress: '00:00:00:00:00:00',
      ipAddress: '127.0.0.1',
      prefixLength: 8,
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
      prefixLength: null,
      subnetMask: null,
      status: 'UP',
      connectedLinkId: null,
    };
    device.interfaces.set(id, iface);

    return ok(id);
  }

  /**
   * Set the IPv4 configuration on an interface.
   *
   * Canonical form: ipAddress + prefixLength (number 0–32). Subnet mask is derived.
   * Backward-compat form: ipAddress + subnetMask (dotted-decimal "255.255.255.0"). Prefix length is derived from mask.
   *
   * The fourth argument maskOrPrefix parameter:
   *   - number → treated as prefix length (e.g., 24 → /24)
   *   - string → treated as dotted-decimal subnet mask (e.g., "255.255.255.0")
   *   - omitted/undefined → only the address is set, but prefixLength/subnetMask remain null
   *
   * Validation errors: INVALID_IPV4_ADDRESS, INVALID_PREFIX_LENGTH, INVALID_SUBNET_MASK
   */
  setInterfaceIp(
    deviceId: DeviceId,
    interfaceId: InterfaceId,
    ipAddress: string,
    maskOrPrefix?: string | number,
  ): Result<void> {
    const device = this._devices.get(deviceId);
    if (!device) {
      return err('ENTITY_NOT_FOUND', `Device ${deviceId} not found`);
    }

    const iface = device.interfaces.get(interfaceId);
    if (!iface) {
      return err('ENTITY_NOT_FOUND', `Interface ${interfaceId} not found on device ${deviceId}`);
    }

    if (!IPv4Address.isValid(ipAddress)) {
      return err('INVALID_IPV4_ADDRESS', `Invalid IPv4 address: ${ipAddress}`);
    }

    let finalPrefixLength: number | null = null;
    let finalSubnetMask: string | null = null;

    if (maskOrPrefix !== undefined) {
      if (typeof maskOrPrefix === 'number') {
        if (!IPv4Address.isValidPrefix(maskOrPrefix)) {
          return err('INVALID_PREFIX_LENGTH', `Invalid prefix length: ${maskOrPrefix}`);
        }
        finalPrefixLength = maskOrPrefix;
        finalSubnetMask = IPv4Address.intToIp(IPv4Subnet.prefixToMaskInt(finalPrefixLength));
      } else {
        if (!IPv4Address.isValid(maskOrPrefix)) {
          return err('INVALID_SUBNET_MASK', `Invalid subnet mask: ${maskOrPrefix}`);
        }
        const derivedPrefix = IPv4Subnet.maskToPrefixLength(maskOrPrefix);
        if (derivedPrefix === null) {
          return err(
            'INVALID_SUBNET_MASK',
            `Non-contiguous or invalid subnet mask: ${maskOrPrefix}`,
          );
        }
        finalPrefixLength = derivedPrefix;
        finalSubnetMask = maskOrPrefix;
      }
    }

    iface.ipAddress = ipAddress;
    iface.prefixLength = finalPrefixLength;
    iface.subnetMask = finalSubnetMask;

    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'DEVICE_UPDATED',
      deviceId: deviceId,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });

    return ok(undefined);
  }

  /**
   * Set interface IPv4 configuration from a CIDR string "192.168.1.10/24".
   * Parses and validates both the address and prefix length together.
   */
  setInterfaceCidr(deviceId: DeviceId, interfaceId: InterfaceId, cidr: string): Result<void> {
    const cidrRes = IPv4Subnet.fromCidr(cidr);
    if (!cidrRes.ok) return err(cidrRes.error.code, cidrRes.error.message, cidrRes.error.context);
    return this.setInterfaceIp(
      deviceId,
      interfaceId,
      cidrRes.value.ip,
      cidrRes.value.subnet.prefixLength,
    );
  }

  /**
   * Returns an IPv4Subnet object for the given interface if it has a valid IP + prefix.
   * Returns null if the interface has no IP or no prefix configured.
   */
  getInterfaceSubnet(deviceId: DeviceId, interfaceId: InterfaceId): IPv4Subnet | null {
    const device = this._devices.get(deviceId);
    if (!device) return null;
    const iface = device.interfaces.get(interfaceId);
    if (!iface || !iface.ipAddress || iface.prefixLength === null) return null;
    const res = IPv4Subnet.create(iface.ipAddress, iface.prefixLength);
    return res.ok ? res.value : null;
  }

  /**
   * Returns the network address for an interface's IP/prefix (e.g., "192.168.1.0").
   * Returns null if the interface is not fully configured.
   */
  getInterfaceNetwork(deviceId: DeviceId, interfaceId: InterfaceId): string | null {
    const subnet = this.getInterfaceSubnet(deviceId, interfaceId);
    return subnet ? subnet.networkAddress : null;
  }

  /**
   * Returns the broadcast address for an interface's IP/prefix (e.g., "192.168.1.255").
   * Returns null if the interface is not fully configured.
   */
  getInterfaceBroadcast(deviceId: DeviceId, interfaceId: InterfaceId): string | null {
    const subnet = this.getInterfaceSubnet(deviceId, interfaceId);
    return subnet ? subnet.broadcastAddress : null;
  }

  /**
   * Returns true if the interface has a valid IP/prefix and the configured IP is a valid
   * host address within that subnet (not network/broadcast except for /31 and /32).
   * Returns null if the interface is not fully configured.
   */
  isInterfaceHostValid(deviceId: DeviceId, interfaceId: InterfaceId): boolean | null {
    const device = this._devices.get(deviceId);
    if (!device) return null;
    const iface = device.interfaces.get(interfaceId);
    if (!iface || !iface.ipAddress || iface.prefixLength === null) return null;
    const subnet = this.getInterfaceSubnet(deviceId, interfaceId);
    return subnet ? subnet.isValidHost(iface.ipAddress) : null;
  }

  /**
   * Remove an interface from a device.
   * Fails if the interface is connected to a link.
   */
  removeInterface(deviceId: DeviceId, interfaceId: InterfaceId): Result<void> {
    const device = this._devices.get(deviceId);
    if (!device) {
      return err('ENTITY_NOT_FOUND', `Device ${deviceId} not found`);
    }

    const iface = device.interfaces.get(interfaceId);
    if (!iface) {
      return err('ENTITY_NOT_FOUND', `Interface ${interfaceId} not found on device ${deviceId}`);
    }

    if (iface.connectedLinkId) {
      return err(
        'INVALID_TOPOLOGY',
        `Cannot remove interface ${interfaceId}: it is connected to a link`,
      );
    }

    device.interfaces.delete(interfaceId);

    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'DEVICE_UPDATED',
      deviceId: deviceId,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });

    return ok(undefined);
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
    if (ifaceA.connectedLinkId)
      return err('INVALID_TOPOLOGY', `Interface ${endpointA} already connected`);
    if (ifaceB.connectedLinkId)
      return err('INVALID_TOPOLOGY', `Interface ${endpointB} already connected`);
    if (endpointA === endpointB)
      return err('INVALID_TOPOLOGY', 'Cannot connect interface to itself');

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

  failInterface(deviceId: DeviceId, interfaceId: InterfaceId): Result<void> {
    const device = this._devices.get(deviceId);
    if (!device) return err('ENTITY_NOT_FOUND', `Device ${deviceId} not found`);

    const iface = device.interfaces.get(interfaceId);
    if (!iface)
      return err('ENTITY_NOT_FOUND', `Interface ${interfaceId} not found on device ${deviceId}`);

    iface.status = 'DOWN';
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'DEVICE_UPDATED',
      deviceId: deviceId,
      simulationTime: this._simulationTick,
      wallClockMs: Date.now(),
    });
    return ok(undefined);
  }

  recoverInterface(deviceId: DeviceId, interfaceId: InterfaceId): Result<void> {
    const device = this._devices.get(deviceId);
    if (!device) return err('ENTITY_NOT_FOUND', `Device ${deviceId} not found`);

    const iface = device.interfaces.get(interfaceId);
    if (!iface)
      return err('ENTITY_NOT_FOUND', `Interface ${interfaceId} not found on device ${deviceId}`);

    iface.status = 'UP';
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'DEVICE_UPDATED',
      deviceId: deviceId,
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
