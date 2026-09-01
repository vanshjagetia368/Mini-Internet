/**
 * @file tests/simulator/device/DeviceEngine.test.ts
 *
 * Comprehensive Device Engine Test Suite — Prompt 5.
 *
 * Covers:
 *   - Device creation (PC, Router, Server)
 *   - DeviceFactory typed creation results
 *   - Interface management (CRUD, duplicates, names)
 *   - MAC address validation, normalization, generation
 *   - IPv4 configuration on interfaces (not subnet logic)
 *   - Device status (UP/DOWN lifecycle)
 *   - Interface status (independent from device status)
 *   - Router multi-interface model
 *   - Network/graph consistency invariants
 *   - Serialization via snapshot()
 *
 * NOT covered here (future prompts):
 *   - Subnet calculation (Prompt 6)
 *   - Packet forwarding (Prompt 7)
 *   - Routing tables (Prompt 6+)
 *   - BFS / Dijkstra (Prompt 6)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkGraph } from '../network/NetworkGraph.js';
import { DeviceFactory } from './DeviceFactory.js';
import { MACAddress } from '../network/MACAddress.js';
import { IPv4Address } from '../network/ipv4/IPv4Address.js';
import { IPv4Subnet } from '../network/ipv4/IPv4Subnet.js';
import { EventBus } from '../events/EventBus.js';
import { IdFactory } from '../types/ids.js';
import type { DeviceId, InterfaceId } from '../types/ids.js';

// ─── Test Setup ───────────────────────────────────────────────────────────────

let eventBus: EventBus;
let graph: NetworkGraph;
let factory: DeviceFactory;

beforeEach(() => {
  eventBus = new EventBus();
  graph = new NetworkGraph(IdFactory.network(), 'Test Network', eventBus);
  factory = new DeviceFactory(graph);
});

// ─── A. Device Creation ───────────────────────────────────────────────────────

describe('Device Creation', () => {
  describe('PC creation', () => {
    it('creates a PC with correct type and status', () => {
      const result = factory.createPc({ name: 'PC-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value.deviceId);
      expect(device).toBeDefined();
      expect(device!.type).toBe('PC');
      expect(device!.status).toBe('UP');
      expect(device!.name).toBe('PC-1');
    });

    it('creates a PC with loopback (lo) and eth0 interfaces', () => {
      const result = factory.createPc({ name: 'PC-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value.deviceId);
      expect(device!.interfaces.size).toBe(2);

      const names = Array.from(device!.interfaces.values()).map((i) => i.name);
      expect(names).toContain('lo');
      expect(names).toContain('eth0');
    });

    it('returns typed creation result with loopbackId and eth0Id', () => {
      const result = factory.createPc({ name: 'PC-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.deviceId).toBeDefined();
      expect(result.value.loopbackId).toBeDefined();
      expect(result.value.eth0Id).toBeDefined();
      expect(result.value.loopbackId).not.toBe(result.value.eth0Id);

      // IDs should resolve to real interfaces
      expect(graph.getInterface(result.value.deviceId, result.value.loopbackId)).toBeDefined();
      expect(graph.getInterface(result.value.deviceId, result.value.eth0Id)).toBeDefined();
    });

    it('assigns a unique ID to each PC', () => {
      const pc1 = factory.createPc({ name: 'PC-1' });
      const pc2 = factory.createPc({ name: 'PC-2' });
      expect(pc1.ok && pc2.ok).toBe(true);
      if (!pc1.ok || !pc2.ok) return;

      expect(pc1.value.deviceId).not.toBe(pc2.value.deviceId);
    });

    it('rejects duplicate PC names', () => {
      factory.createPc({ name: 'PC-1' });
      const duplicate = factory.createPc({ name: 'PC-1' });
      expect(duplicate.ok).toBe(false);
      if (!duplicate.ok) {
        expect(duplicate.error.code).toBe('DUPLICATE_ENTITY');
      }
    });
  });

  describe('Router creation', () => {
    it('creates a Router with correct type and status', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value.deviceId);
      expect(device!.type).toBe('ROUTER');
      expect(device!.status).toBe('UP');
      expect(device!.name).toBe('R1');
    });

    it('creates a Router with only loopback by default (no eth0)', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value.deviceId);
      expect(device!.interfaces.size).toBe(1);

      const names = Array.from(device!.interfaces.values()).map((i) => i.name);
      expect(names).toContain('lo');
      expect(names).not.toContain('eth0');
    });

    it('returns typed RouterCreationResult with loopbackId', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.deviceId).toBeDefined();
      expect(result.value.loopbackId).toBeDefined();

      const lo = graph.getInterface(result.value.deviceId, result.value.loopbackId);
      expect(lo).toBeDefined();
      expect(lo!.name).toBe('lo');
    });

    it('rejects duplicate Router names', () => {
      factory.createRouter({ name: 'R1' });
      const duplicate = factory.createRouter({ name: 'R1' });
      expect(duplicate.ok).toBe(false);
      if (!duplicate.ok) {
        expect(duplicate.error.code).toBe('DUPLICATE_ENTITY');
      }
    });
  });

  describe('Server creation', () => {
    it('creates a Server with correct type and status', () => {
      const result = factory.createServer({ name: 'Server-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value.deviceId);
      expect(device!.type).toBe('SERVER');
      expect(device!.status).toBe('UP');
      expect(device!.name).toBe('Server-1');
    });

    it('creates a Server with loopback and eth0', () => {
      const result = factory.createServer({ name: 'Server-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value.deviceId);
      expect(device!.interfaces.size).toBe(2);

      const names = Array.from(device!.interfaces.values()).map((i) => i.name);
      expect(names).toContain('lo');
      expect(names).toContain('eth0');
    });

    it('rejects duplicate Server names', () => {
      factory.createServer({ name: 'Server-1' });
      const duplicate = factory.createServer({ name: 'Server-1' });
      expect(duplicate.ok).toBe(false);
      if (!duplicate.ok) {
        expect(duplicate.error.code).toBe('DUPLICATE_ENTITY');
      }
    });
  });

  describe('Generic createDevice', () => {
    it('creates a PC via generic createDevice', () => {
      const result = factory.createDevice({ name: 'PC-G', type: 'PC' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value);
      expect(device!.type).toBe('PC');
    });

    it('creates a Router via generic createDevice', () => {
      const result = factory.createDevice({ name: 'R-G', type: 'ROUTER' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value);
      expect(device!.type).toBe('ROUTER');
    });

    it('creates a Server via generic createDevice', () => {
      const result = factory.createDevice({ name: 'Srv-G', type: 'SERVER' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value);
      expect(device!.type).toBe('SERVER');
    });

    it('rejects SWITCH type (not implemented in Phase 1)', () => {
      const result = factory.createDevice({ name: 'SW-1', type: 'SWITCH' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_COMMAND');
      }
    });
  });

  describe('Mixed device creation and retrieval', () => {
    it('creates PC, Router, and Server and retrieves each with correct type', () => {
      const pc = factory.createPc({ name: 'PC-1' });
      const router = factory.createRouter({ name: 'R1' });
      const server = factory.createServer({ name: 'Srv-1' });

      expect(pc.ok && router.ok && server.ok).toBe(true);
      if (!pc.ok || !router.ok || !server.ok) return;

      expect(graph.getDevice(pc.value.deviceId)!.type).toBe('PC');
      expect(graph.getDevice(router.value.deviceId)!.type).toBe('ROUTER');
      expect(graph.getDevice(server.value.deviceId)!.type).toBe('SERVER');
    });

    it('all created devices have unique IDs', () => {
      const ids: DeviceId[] = [];
      for (let i = 0; i < 5; i++) {
        const r = factory.createPc({ name: `PC-${i}` });
        if (r.ok) ids.push(r.value.deviceId);
      }
      expect(new Set(ids).size).toBe(5);
    });
  });
});

// ─── B. Device Status ─────────────────────────────────────────────────────────

describe('Device Status', () => {
  it('device starts UP', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(graph.getDevice(result.value.deviceId)!.status).toBe('UP');
  });

  it('device transitions UP → DOWN', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    graph.failDevice(result.value.deviceId);
    expect(graph.getDevice(result.value.deviceId)!.status).toBe('DOWN');
  });

  it('device transitions DOWN → UP', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    graph.failDevice(result.value.deviceId);
    graph.recoverDevice(result.value.deviceId);
    expect(graph.getDevice(result.value.deviceId)!.status).toBe('UP');
  });

  it('DOWN device still exists in topology', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    graph.failDevice(result.value.deviceId);

    // Device must still be present
    expect(graph.hasDevice(result.value.deviceId)).toBe(true);
    expect(graph.getDevice(result.value.deviceId)).toBeDefined();
    expect(graph.deviceIds()).toContain(result.value.deviceId);
  });

  it('DOWN device still has all its interfaces', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    graph.failDevice(result.value.deviceId);

    const device = graph.getDevice(result.value.deviceId);
    expect(device!.interfaces.size).toBe(2); // lo + eth0
  });

  it('DOWN device still appears in topology snapshot', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    graph.failDevice(result.value.deviceId);

    const snapshot = graph.snapshot();
    expect(snapshot.devices.has(result.value.deviceId)).toBe(true);
    expect(snapshot.devices.get(result.value.deviceId)!.status).toBe('DOWN');
  });
});

// ─── C. Interface Management ──────────────────────────────────────────────────

describe('Interface Management', () => {
  describe('Router multi-interface model', () => {
    it('adds eth0, eth1, eth2 to a Router', () => {
      const routerResult = factory.createRouter({ name: 'R1' });
      expect(routerResult.ok).toBe(true);
      if (!routerResult.ok) return;

      const rid = routerResult.value.deviceId;
      const e0 = graph.addInterface(rid, 'eth0');
      const e1 = graph.addInterface(rid, 'eth1');
      const e2 = graph.addInterface(rid, 'eth2');

      expect(e0.ok && e1.ok && e2.ok).toBe(true);

      // Router should now have: lo, eth0, eth1, eth2
      const ifaces = graph.getInterfaces(rid);
      expect(ifaces.length).toBe(4);
      const names = ifaces.map((i) => i.name);
      expect(names).toContain('lo');
      expect(names).toContain('eth0');
      expect(names).toContain('eth1');
      expect(names).toContain('eth2');
    });

    it('all router interfaces belong to the router device', () => {
      const routerResult = factory.createRouter({ name: 'R1' });
      expect(routerResult.ok).toBe(true);
      if (!routerResult.ok) return;

      const rid = routerResult.value.deviceId;
      graph.addInterface(rid, 'eth0');
      graph.addInterface(rid, 'eth1');

      const ifaces = graph.getInterfaces(rid);
      for (const iface of ifaces) {
        expect(iface.deviceId).toBe(rid);
      }
    });

    it('each router interface has a stable unique ID', () => {
      const routerResult = factory.createRouter({ name: 'R1' });
      expect(routerResult.ok).toBe(true);
      if (!routerResult.ok) return;

      const rid = routerResult.value.deviceId;
      const e0 = graph.addInterface(rid, 'eth0');
      const e1 = graph.addInterface(rid, 'eth1');
      const e2 = graph.addInterface(rid, 'eth2');

      if (!e0.ok || !e1.ok || !e2.ok) return;

      const ids = [routerResult.value.loopbackId, e0.value, e1.value, e2.value];
      expect(new Set(ids).size).toBe(4);
    });
  });

  describe('Interface name uniqueness', () => {
    it('rejects duplicate interface name on same device', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const rid = result.value.deviceId;
      graph.addInterface(rid, 'eth0');

      const duplicate = graph.addInterface(rid, 'eth0');
      expect(duplicate.ok).toBe(false);
      if (!duplicate.ok) {
        expect(duplicate.error.code).toBe('DUPLICATE_INTERFACE');
      }
    });

    it('allows same interface name on different devices', () => {
      const r1 = factory.createRouter({ name: 'R1' });
      const r2 = factory.createRouter({ name: 'R2' });
      expect(r1.ok && r2.ok).toBe(true);
      if (!r1.ok || !r2.ok) return;

      const r1e0 = graph.addInterface(r1.value.deviceId, 'eth0');
      const r2e0 = graph.addInterface(r2.value.deviceId, 'eth0');

      expect(r1e0.ok).toBe(true);
      expect(r2e0.ok).toBe(true);
    });
  });

  describe('Interface lookup', () => {
    it('retrieves interface by device+interface ID', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const rid = result.value.deviceId;
      const eth0Result = graph.addInterface(rid, 'eth0');
      expect(eth0Result.ok).toBe(true);
      if (!eth0Result.ok) return;

      const iface = graph.getInterface(rid, eth0Result.value);
      expect(iface).toBeDefined();
      expect(iface!.name).toBe('eth0');
      expect(iface!.deviceId).toBe(rid);
    });

    it('returns undefined for non-existent interface', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const iface = graph.getInterface(result.value.deviceId, 'nonexistent' as InterfaceId);
      expect(iface).toBeUndefined();
    });

    it('hasInterface returns correct boolean', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const rid = result.value.deviceId;
      const eth0Result = graph.addInterface(rid, 'eth0');
      if (!eth0Result.ok) return;

      expect(graph.hasInterface(rid, eth0Result.value)).toBe(true);
      expect(graph.hasInterface(rid, 'nonexistent' as InterfaceId)).toBe(false);
    });
  });

  describe('Interface removal', () => {
    it('removes a disconnected interface successfully', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const rid = result.value.deviceId;
      const eth0 = graph.addInterface(rid, 'eth0');
      if (!eth0.ok) return;

      const removeResult = graph.removeInterface(rid, eth0.value);
      expect(removeResult.ok).toBe(true);
      expect(graph.hasInterface(rid, eth0.value)).toBe(false);
    });

    it('rejects removal of an interface connected to a link', () => {
      const r1 = factory.createRouter({ name: 'R1' });
      const pc = factory.createPc({ name: 'PC-1' });
      expect(r1.ok && pc.ok).toBe(true);
      if (!r1.ok || !pc.ok) return;

      const eth0 = graph.addInterface(r1.value.deviceId, 'eth0');
      if (!eth0.ok) return;

      const pcEth0 = graph.getInterface(pc.value.deviceId, pc.value.eth0Id);
      graph.addLink(eth0.value, pcEth0!.id);

      const removeResult = graph.removeInterface(r1.value.deviceId, eth0.value);
      expect(removeResult.ok).toBe(false);
      if (!removeResult.ok) {
        expect(removeResult.error.code).toBe('INVALID_TOPOLOGY');
      }
    });
  });

  describe('Interface status', () => {
    it('interface starts UP', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const eth0 = graph.addInterface(result.value.deviceId, 'eth0');
      if (!eth0.ok) return;

      const iface = graph.getInterface(result.value.deviceId, eth0.value);
      expect(iface!.status).toBe('UP');
    });

    it('interface transitions UP → DOWN independently of device', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const rid = result.value.deviceId;
      const eth0 = graph.addInterface(rid, 'eth0');
      if (!eth0.ok) return;

      graph.failInterface(rid, eth0.value);

      expect(graph.getInterface(rid, eth0.value)!.status).toBe('DOWN');
      // Device itself remains UP
      expect(graph.getDevice(rid)!.status).toBe('UP');
    });

    it('interface transitions DOWN → UP', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const rid = result.value.deviceId;
      const eth0 = graph.addInterface(rid, 'eth0');
      if (!eth0.ok) return;

      graph.failInterface(rid, eth0.value);
      graph.recoverInterface(rid, eth0.value);

      expect(graph.getInterface(rid, eth0.value)!.status).toBe('UP');
    });

    it('device DOWN does not automatically set interfaces to DOWN', () => {
      const result = factory.createPc({ name: 'PC-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      graph.failDevice(result.value.deviceId);

      // Interfaces retain their own status
      const ifaces = graph.getInterfaces(result.value.deviceId);
      expect(ifaces.every((i) => i.status === 'UP')).toBe(true);
    });
  });
});

// ─── D. MAC Address ───────────────────────────────────────────────────────────

describe('MAC Address', () => {
  describe('Validation', () => {
    it('accepts valid MAC with colons (uppercase)', () => {
      const result = MACAddress.create('00:1A:2B:3C:4D:5E');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.toString()).toBe('00:1A:2B:3C:4D:5E');
    });

    it('accepts valid MAC with hyphens and normalizes to colons uppercase', () => {
      const result = MACAddress.create('00-1a-2b-3c-4d-5e');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.toString()).toBe('00:1A:2B:3C:4D:5E');
    });

    it('accepts valid MAC with colons (lowercase) and normalizes', () => {
      const result = MACAddress.create('aa:bb:cc:dd:ee:ff');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.toString()).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('rejects MAC that is too short', () => {
      const result = MACAddress.create('00:1A:2B:3C:4D');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_MAC_ADDRESS');
    });

    it('rejects MAC that is too long', () => {
      const result = MACAddress.create('00:1A:2B:3C:4D:5E:6F');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_MAC_ADDRESS');
    });

    it('rejects MAC with invalid hex characters', () => {
      const result = MACAddress.create('00:1A:2B:3C:4D:5Z');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_MAC_ADDRESS');
    });

    it('rejects completely malformed MAC', () => {
      const invalids = ['invalid', '', 'not-a-mac', 'GG:HH:II:JJ:KK:LL'];
      for (const mac of invalids) {
        const result = MACAddress.create(mac);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('INVALID_MAC_ADDRESS');
      }
    });

    it('rejects MAC with spaces instead of separators', () => {
      const result = MACAddress.create('00 1A 2B 3C 4D 5E');
      expect(result.ok).toBe(false);
    });
  });

  describe('Normalization', () => {
    it('always normalizes to XX:XX:XX:XX:XX:XX uppercase with colons', () => {
      const mixedCases = [
        { input: 'aa:bb:cc:dd:ee:ff', expected: 'AA:BB:CC:DD:EE:FF' },
        { input: 'AA:BB:CC:DD:EE:FF', expected: 'AA:BB:CC:DD:EE:FF' },
        { input: 'aA:Bb:cC:dD:eE:fF', expected: 'AA:BB:CC:DD:EE:FF' },
        { input: 'aa-bb-cc-dd-ee-ff', expected: 'AA:BB:CC:DD:EE:FF' },
      ];

      for (const { input, expected } of mixedCases) {
        const result = MACAddress.create(input);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.toString()).toBe(expected);
      }
    });
  });

  describe('Generation', () => {
    it('generateLocal produces a valid locally-administered unicast MAC', () => {
      const mac = MACAddress.generateLocal();
      const reparse = MACAddress.create(mac.toString());
      expect(reparse.ok).toBe(true);

      // Check locally-administered bit (bit 1 of first octet = 1)
      const firstOctet = parseInt(mac.toString().split(':')[0]!, 16);
      expect(firstOctet & 0b00000010).toBe(0b00000010);
      // Check multicast bit (bit 0 of first octet = 0)
      expect(firstOctet & 0b00000001).toBe(0);
    });

    it('generateLocalForTesting is deterministic', () => {
      const mac1 = MACAddress.generateLocalForTesting(42);
      const mac2 = MACAddress.generateLocalForTesting(42);
      expect(mac1.toString()).toBe(mac2.toString());
    });

    it('generateLocalForTesting produces different MACs for different counters', () => {
      const mac0 = MACAddress.generateLocalForTesting(0);
      const mac1 = MACAddress.generateLocalForTesting(1);
      const mac99 = MACAddress.generateLocalForTesting(99);

      expect(mac0.toString()).not.toBe(mac1.toString());
      expect(mac0.toString()).not.toBe(mac99.toString());
    });

    it('generateLocalForTesting produces unique MACs for 50 sequential counters', () => {
      const macs = new Set<string>();
      for (let i = 0; i < 50; i++) {
        macs.add(MACAddress.generateLocalForTesting(i).toString());
      }
      expect(macs.size).toBe(50);
    });
  });

  describe('MAC on interfaces', () => {
    it('addInterface with explicit MAC stores it normalized', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const eth0 = graph.addInterface(result.value.deviceId, 'eth0', '00-1a-2b-3c-4d-5e');
      expect(eth0.ok).toBe(true);
      if (!eth0.ok) return;

      const iface = graph.getInterface(result.value.deviceId, eth0.value);
      expect(iface!.macAddress).toBe('00:1A:2B:3C:4D:5E');
    });

    it('addInterface rejects invalid MAC', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const eth0 = graph.addInterface(result.value.deviceId, 'eth0', 'not-a-valid-mac');
      expect(eth0.ok).toBe(false);
      if (!eth0.ok) {
        expect(eth0.error.code).toBe('INVALID_MAC_ADDRESS');
      }
    });

    it('router with multiple interfaces can have distinct MACs', () => {
      const result = factory.createRouter({ name: 'R1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const rid = result.value.deviceId;
      const mac0 = MACAddress.generateLocalForTesting(10).toString();
      const mac1 = MACAddress.generateLocalForTesting(11).toString();
      const mac2 = MACAddress.generateLocalForTesting(12).toString();

      graph.addInterface(rid, 'eth0', mac0);
      graph.addInterface(rid, 'eth1', mac1);
      graph.addInterface(rid, 'eth2', mac2);

      const ifaces = graph.getInterfaces(rid);
      const macs = ifaces.map((i) => i.macAddress);
      const uniqueMacs = new Set(macs);
      // All interfaces (lo + eth0 + eth1 + eth2) should have unique MACs
      expect(uniqueMacs.size).toBe(4);
    });

    it('loopback always has zeroed MAC (00:00:00:00:00:00)', () => {
      const result = factory.createPc({ name: 'PC-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const lo = graph.getInterface(result.value.deviceId, result.value.loopbackId);
      expect(lo!.macAddress).toBe('00:00:00:00:00:00');
    });
  });
});

// ─── E. IPv4 Configuration ────────────────────────────────────────────────────

describe('IPv4 Configuration on Interfaces', () => {
  it('attaches a valid IPv4 address to an interface', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    expect(pc.ok).toBe(true);
    if (!pc.ok) return;

    const result = graph.setInterfaceIp(
      pc.value.deviceId,
      pc.value.eth0Id,
      '192.168.1.10',
      '255.255.255.0',
    );
    expect(result.ok).toBe(true);

    const iface = graph.getInterface(pc.value.deviceId, pc.value.eth0Id);
    expect(iface!.ipAddress).toBe('192.168.1.10');
    expect(iface!.subnetMask).toBe('255.255.255.0');
  });

  it('attaches IPv4 without subnet mask', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    expect(pc.ok).toBe(true);
    if (!pc.ok) return;

    const result = graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '10.0.0.1');
    expect(result.ok).toBe(true);

    const iface = graph.getInterface(pc.value.deviceId, pc.value.eth0Id);
    expect(iface!.ipAddress).toBe('10.0.0.1');
    expect(iface!.subnetMask).toBeNull();
  });

  it('rejects invalid IPv4 address', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    expect(pc.ok).toBe(true);
    if (!pc.ok) return;

    const result = graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '999.0.0.1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_IPV4_ADDRESS');
    }
  });

  it('rejects invalid subnet mask', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    expect(pc.ok).toBe(true);
    if (!pc.ok) return;

    const result = graph.setInterfaceIp(
      pc.value.deviceId,
      pc.value.eth0Id,
      '10.0.0.1',
      '300.255.255.0',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_SUBNET_MASK');
    }
  });

  it('rejects setInterfaceIp for non-existent device', () => {
    const result = graph.setInterfaceIp(
      'nonexistent' as DeviceId,
      'someif' as InterfaceId,
      '10.0.0.1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    }
  });

  it('rejects setInterfaceIp for non-existent interface', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    expect(pc.ok).toBe(true);
    if (!pc.ok) return;

    const result = graph.setInterfaceIp(
      pc.value.deviceId,
      'nonexistent' as InterfaceId,
      '10.0.0.1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    }
  });

  it('router with multiple interfaces can have different IPs on each interface', () => {
    const r = factory.createRouter({ name: 'R1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rid = r.value.deviceId;
    const e0 = graph.addInterface(rid, 'eth0');
    const e1 = graph.addInterface(rid, 'eth1');
    expect(e0.ok && e1.ok).toBe(true);
    if (!e0.ok || !e1.ok) return;

    graph.setInterfaceIp(rid, e0.value, '10.0.0.1', '255.255.255.0');
    graph.setInterfaceIp(rid, e1.value, '192.168.1.1', '255.255.255.0');

    const iface0 = graph.getInterface(rid, e0.value);
    const iface1 = graph.getInterface(rid, e1.value);

    expect(iface0!.ipAddress).toBe('10.0.0.1');
    expect(iface1!.ipAddress).toBe('192.168.1.1');
  });

  it('IP belongs to interface, not device (device has no direct IP field)', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    expect(pc.ok).toBe(true);
    if (!pc.ok) return;

    graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '172.16.0.5');

    const device = graph.getDevice(pc.value.deviceId);
    // Device does NOT have a direct ipAddress field — only its interfaces do
    expect('ipAddress' in device!).toBe(false);

    // IP is accessible only through the interface
    const iface = graph.getInterface(pc.value.deviceId, pc.value.eth0Id);
    expect(iface!.ipAddress).toBe('172.16.0.5');
  });

  describe('IPv4Address validation primitive', () => {
    it('accepts valid dotted-decimal IPs', () => {
      const valids = ['0.0.0.0', '192.168.1.1', '10.0.0.1', '172.16.0.1', '255.255.255.255'];
      for (const ip of valids) {
        expect(IPv4Address.isValid(ip)).toBe(true);
      }
    });

    it('rejects invalid IPs', () => {
      const invalids = ['256.0.0.1', '192.168.1', '192.168.1.1.1', 'not-an-ip', '', '1.2.3.999'];
      for (const ip of invalids) {
        expect(IPv4Address.isValid(ip)).toBe(false);
      }
    });

    it('validates prefix lengths', () => {
      expect(IPv4Address.isValidPrefix(0)).toBe(true);
      expect(IPv4Address.isValidPrefix(24)).toBe(true);
      expect(IPv4Address.isValidPrefix(32)).toBe(true);
      expect(IPv4Address.isValidPrefix(-1)).toBe(false);
      expect(IPv4Address.isValidPrefix(33)).toBe(false);
      expect(IPv4Address.isValidPrefix(1.5)).toBe(false);
    });
  });
});

// ─── F. Device Type Queries ───────────────────────────────────────────────────

describe('Device Type Queries', () => {
  it('getRouters returns all routers only', () => {
    factory.createRouter({ name: 'R1' });
    factory.createRouter({ name: 'R2' });
    factory.createPc({ name: 'PC-1' });
    factory.createServer({ name: 'Srv-1' });

    const routers = graph.getRouters();
    expect(routers.length).toBe(2);
    expect(routers.every((r) => r.type === 'ROUTER')).toBe(true);
  });

  it('getPcs returns all PCs only', () => {
    factory.createPc({ name: 'PC-1' });
    factory.createPc({ name: 'PC-2' });
    factory.createRouter({ name: 'R1' });

    const pcs = graph.getPcs();
    expect(pcs.length).toBe(2);
    expect(pcs.every((p) => p.type === 'PC')).toBe(true);
  });

  it('getServers returns all servers only', () => {
    factory.createServer({ name: 'Srv-1' });
    factory.createServer({ name: 'Srv-2' });
    factory.createPc({ name: 'PC-1' });

    const servers = graph.getServers();
    expect(servers.length).toBe(2);
    expect(servers.every((s) => s.type === 'SERVER')).toBe(true);
  });

  it('returns empty arrays when no devices of a type exist', () => {
    factory.createPc({ name: 'PC-1' });
    expect(graph.getRouters()).toEqual([]);
    expect(graph.getServers()).toEqual([]);
  });

  it('device type is type-safe (ROUTER literal match)', () => {
    const r = factory.createRouter({ name: 'R1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const device = graph.getDevice(r.value.deviceId);
    // Type-safe comparison — no arbitrary string
    expect(device!.type === 'ROUTER').toBe(true);
    expect(device!.type === 'PC').toBe(false);
  });

  it('getDeviceByName finds device by name', () => {
    factory.createPc({ name: 'TestPC' });
    const found = graph.getDeviceByName('TestPC');
    expect(found).toBeDefined();
    expect(found!.name).toBe('TestPC');
    expect(found!.type).toBe('PC');
  });

  it('getDeviceByName returns undefined for missing name', () => {
    expect(graph.getDeviceByName('NonExistent')).toBeUndefined();
  });
});

// ─── G. Network and Graph Consistency ────────────────────────────────────────

describe('Network and Graph Consistency', () => {
  it('device appears in graph after creation', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(graph.hasDevice(result.value.deviceId)).toBe(true);
    expect(graph.deviceIds()).toContain(result.value.deviceId);

    const snap = graph.snapshot();
    expect(snap.devices.has(result.value.deviceId)).toBe(true);
  });

  it('device does NOT appear in graph after removal', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    graph.removeDevice(result.value.deviceId);

    expect(graph.hasDevice(result.value.deviceId)).toBe(false);
    expect(graph.deviceIds()).not.toContain(result.value.deviceId);

    const snap = graph.snapshot();
    expect(snap.devices.has(result.value.deviceId)).toBe(false);
  });

  it('device removal cascades to remove connected links', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    const server = factory.createServer({ name: 'Srv-1' });
    expect(pc.ok && server.ok).toBe(true);
    if (!pc.ok || !server.ok) return;

    const linkResult = graph.addLink(pc.value.eth0Id, server.value.eth0Id);
    expect(linkResult.ok).toBe(true);
    if (!linkResult.ok) return;

    const linkId = linkResult.value;

    graph.removeDevice(pc.value.deviceId);

    // Link must be removed
    expect(graph.hasLink(linkId)).toBe(false);
    expect(graph.getLink(linkId)).toBeUndefined();

    // Server's eth0 must be disconnected (no stale link reference)
    const srvEth0 = graph.getInterface(server.value.deviceId, server.value.eth0Id);
    expect(srvEth0!.connectedLinkId).toBeNull();
  });

  it('interface removal does not remove the device', () => {
    const router = factory.createRouter({ name: 'R1' });
    expect(router.ok).toBe(true);
    if (!router.ok) return;

    const rid = router.value.deviceId;
    const eth0 = graph.addInterface(rid, 'eth0');
    if (!eth0.ok) return;

    graph.removeInterface(rid, eth0.value);

    expect(graph.hasDevice(rid)).toBe(true);
    expect(graph.hasInterface(rid, eth0.value)).toBe(false);
  });

  it('snapshot does not expose internal mutable state', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    expect(pc.ok).toBe(true);
    if (!pc.ok) return;

    const snap = graph.snapshot();

    // Modifying the snapshot must NOT affect the live graph
    snap.devices.delete(pc.value.deviceId);
    expect(graph.hasDevice(pc.value.deviceId)).toBe(true);
  });

  it('snapshot includes full interface data for serialization', () => {
    const pc = factory.createPc({ name: 'PC-1' });
    expect(pc.ok).toBe(true);
    if (!pc.ok) return;

    graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '10.0.0.5', '255.255.255.0');

    const snap = graph.snapshot();
    const snapDevice = snap.devices.get(pc.value.deviceId);
    expect(snapDevice).toBeDefined();

    const snapEth0 = snapDevice!.interfaces.get(pc.value.eth0Id);
    expect(snapEth0).toBeDefined();
    expect(snapEth0!.ipAddress).toBe('10.0.0.5');
    expect(snapEth0!.subnetMask).toBe('255.255.255.0');
    expect(snapEth0!.macAddress).toBeDefined();
    expect(snapEth0!.status).toBe('UP');
  });
});

// ─── H. Event Emission ────────────────────────────────────────────────────────

describe('Event Emission', () => {
  it('emits DEVICE_CREATED event when device is added', () => {
    const events: unknown[] = [];
    eventBus.onAll((e) => events.push(e));

    factory.createPc({ name: 'PC-1' });

    const deviceCreated = events.find((e: any) => e.type === 'DEVICE_CREATED');
    expect(deviceCreated).toBeDefined();
  });

  it('emits DEVICE_REMOVED event when device is removed', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const events: unknown[] = [];
    eventBus.onAll((e) => events.push(e));

    graph.removeDevice(result.value.deviceId);

    const deviceRemoved = events.find((e: any) => e.type === 'DEVICE_REMOVED');
    expect(deviceRemoved).toBeDefined();
  });

  it('emits DEVICE_UPDATED when interface IP is set', () => {
    const result = factory.createPc({ name: 'PC-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const events: unknown[] = [];
    eventBus.onAll((e) => events.push(e));

    graph.setInterfaceIp(result.value.deviceId, result.value.eth0Id, '10.0.0.1');

    const updated = events.find((e: any) => e.type === 'DEVICE_UPDATED');
    expect(updated).toBeDefined();
  });
});

// ─── I. Error Handling ────────────────────────────────────────────────────────

describe('Error Handling', () => {
  it('getDevice returns undefined for non-existent device', () => {
    expect(graph.getDevice('nonexistent' as DeviceId)).toBeUndefined();
  });

  it('hasDevice returns false for non-existent device', () => {
    expect(graph.hasDevice('nonexistent' as DeviceId)).toBe(false);
  });

  it('removeDevice fails gracefully for non-existent ID', () => {
    const result = graph.removeDevice('nonexistent' as DeviceId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    }
  });

  it('removeInterface fails for non-existent device', () => {
    const result = graph.removeInterface('nonexistent' as DeviceId, 'iface' as InterfaceId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    }
  });

  it('failDevice fails for non-existent device', () => {
    const result = graph.failDevice('nonexistent' as DeviceId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    }
  });

  it('failInterface fails for non-existent device', () => {
    const result = graph.failInterface('nonexistent' as DeviceId, 'iface' as InterfaceId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    }
  });
});

// ─── J. IPv4 / Subnet Engine Integration — Prompt 6 ──────────────────────────

describe('IPv4 / Subnet Engine Integration (Prompt 6)', () => {
  describe('prefixLength as canonical config', () => {
    it('setInterfaceIp accepts numeric prefixLength and derives subnetMask', () => {
      const pc = factory.createPc({ name: 'PC-1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const result = graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '192.168.1.10', 24);
      expect(result.ok).toBe(true);

      const iface = graph.getInterface(pc.value.deviceId, pc.value.eth0Id);
      expect(iface!.ipAddress).toBe('192.168.1.10');
      expect(iface!.prefixLength).toBe(24);
      expect(iface!.subnetMask).toBe('255.255.255.0');
    });

    it('setInterfaceIp with dotted mask string derives prefixLength (backward compat)', () => {
      const pc = factory.createPc({ name: 'PC-1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const result = graph.setInterfaceIp(
        pc.value.deviceId,
        pc.value.eth0Id,
        '10.0.0.5',
        '255.255.0.0',
      );
      expect(result.ok).toBe(true);

      const iface = graph.getInterface(pc.value.deviceId, pc.value.eth0Id);
      expect(iface!.ipAddress).toBe('10.0.0.5');
      expect(iface!.subnetMask).toBe('255.255.0.0');
      expect(iface!.prefixLength).toBe(16);
    });

    it('setInterfaceIp rejects non-contiguous subnet mask', () => {
      const pc = factory.createPc({ name: 'PC-1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const result = graph.setInterfaceIp(
        pc.value.deviceId,
        pc.value.eth0Id,
        '10.0.0.1',
        '255.0.255.0',
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_SUBNET_MASK');
    });

    it('setInterfaceIp rejects invalid prefixLength (-1, 33, fractional)', () => {
      const pc = factory.createPc({ name: 'PC-1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const r1 = graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '10.0.0.1', -1);
      expect(r1.ok).toBe(false);
      if (!r1.ok) expect(r1.error.code).toBe('INVALID_PREFIX_LENGTH');

      const r2 = graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '10.0.0.1', 33);
      expect(r2.ok).toBe(false);
      if (!r2.ok) expect(r2.error.code).toBe('INVALID_PREFIX_LENGTH');

      const r3 = graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '10.0.0.1', 24.5);
      expect(r3.ok).toBe(false);
      if (!r3.ok) expect(r3.error.code).toBe('INVALID_PREFIX_LENGTH');
    });
  });

  describe('setInterfaceCidr parses CIDR notation', () => {
    it('accepts valid CIDR "192.168.1.10/24"', () => {
      const pc = factory.createPc({ name: 'PC-1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const r = graph.setInterfaceCidr(pc.value.deviceId, pc.value.eth0Id, '192.168.1.10/24');
      expect(r.ok).toBe(true);

      const iface = graph.getInterface(pc.value.deviceId, pc.value.eth0Id);
      expect(iface!.ipAddress).toBe('192.168.1.10');
      expect(iface!.prefixLength).toBe(24);
      expect(iface!.subnetMask).toBe('255.255.255.0');
    });

    it('rejects invalid CIDR strings', () => {
      const pc = factory.createPc({ name: 'PC-1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const noSlash = graph.setInterfaceCidr(pc.value.deviceId, pc.value.eth0Id, '10.0.0.1');
      expect(noSlash.ok).toBe(false);
      if (!noSlash.ok) expect(noSlash.error.code).toBe('INVALID_CIDR');

      const badPrefix = graph.setInterfaceCidr(pc.value.deviceId, pc.value.eth0Id, '10.0.0.1/33');
      expect(badPrefix.ok).toBe(false);

      const badIp = graph.setInterfaceCidr(pc.value.deviceId, pc.value.eth0Id, '256.0.0.1/24');
      expect(badIp.ok).toBe(false);
    });
  });

  describe('Interface Integration: PC with 192.168.1.10/24', () => {
    it('calculates network and broadcast correctly via helper methods', () => {
      const pc = factory.createPc({ name: 'PC1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '192.168.1.10', 24);

      expect(graph.getInterfaceNetwork(pc.value.deviceId, pc.value.eth0Id)).toBe('192.168.1.0');
      expect(graph.getInterfaceBroadcast(pc.value.deviceId, pc.value.eth0Id)).toBe('192.168.1.255');

      const subnet = graph.getInterfaceSubnet(pc.value.deviceId, pc.value.eth0Id);
      expect(subnet).not.toBeNull();
      expect(subnet!.networkAddress).toBe('192.168.1.0');
      expect(subnet!.broadcastAddress).toBe('192.168.1.255');
      expect(subnet!.subnetMask).toBe('255.255.255.0');
      expect(subnet!.prefixLength).toBe(24);
    });

    it('validates host correctness: 192.168.1.10 is valid host in /24', () => {
      const pc = factory.createPc({ name: 'PC1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '192.168.1.10', 24);
      expect(graph.isInterfaceHostValid(pc.value.deviceId, pc.value.eth0Id)).toBe(true);
    });

    it('loopback interface (127.0.0.1/8) correctly reports network/broadcast', () => {
      const pc = factory.createPc({ name: 'PC1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const lo = pc.value.loopbackId;
      expect(graph.getInterfaceNetwork(pc.value.deviceId, lo)).toBe('127.0.0.0');
      expect(graph.getInterfaceBroadcast(pc.value.deviceId, lo)).toBe('127.255.255.255');

      const iface = graph.getInterface(pc.value.deviceId, lo);
      expect(iface!.prefixLength).toBe(8);
      expect(iface!.subnetMask).toBe('255.0.0.0');
    });

    it('unconfigured interface returns null for subnet helpers', () => {
      const pc = factory.createPc({ name: 'PC1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const r = factory.createRouter({ name: 'R1' });
      if (!r.ok) return;
      const eth0 = graph.addInterface(r.value.deviceId, 'eth0');
      if (!eth0.ok) return;

      expect(graph.getInterfaceSubnet(r.value.deviceId, eth0.value)).toBeNull();
      expect(graph.getInterfaceNetwork(r.value.deviceId, eth0.value)).toBeNull();
      expect(graph.getInterfaceBroadcast(r.value.deviceId, eth0.value)).toBeNull();
      expect(graph.isInterfaceHostValid(r.value.deviceId, eth0.value)).toBeNull();
    });
  });

  describe('Router Multi-Subnet Test (Prompt 6 §38)', () => {
    let rid: DeviceId;
    let eth0Id: InterfaceId;
    let eth1Id: InterfaceId;
    let eth2Id: InterfaceId;

    beforeEach(() => {
      const r = factory.createRouter({ name: 'R1' });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error('Router creation failed');
      rid = r.value.deviceId;
      const e0 = graph.addInterface(rid, 'eth0');
      const e1 = graph.addInterface(rid, 'eth1');
      const e2 = graph.addInterface(rid, 'eth2');
      expect(e0.ok && e1.ok && e2.ok).toBe(true);
      if (!e0.ok || !e1.ok || !e2.ok) throw new Error('iface');
      eth0Id = e0.value;
      eth1Id = e1.value;
      eth2Id = e2.value;
    });

    it('eth0 10.0.0.1/24 → network 10.0.0.0 broadcast 10.0.0.255', () => {
      graph.setInterfaceIp(rid, eth0Id, '10.0.0.1', 24);
      expect(graph.getInterfaceNetwork(rid, eth0Id)).toBe('10.0.0.0');
      expect(graph.getInterfaceBroadcast(rid, eth0Id)).toBe('10.0.0.255');
      const iface = graph.getInterface(rid, eth0Id);
      expect(iface!.subnetMask).toBe('255.255.255.0');
      expect(iface!.prefixLength).toBe(24);
    });

    it('eth1 10.0.1.1/24 → network 10.0.1.0 (different subnet than eth0)', () => {
      graph.setInterfaceIp(rid, eth0Id, '10.0.0.1', 24);
      graph.setInterfaceIp(rid, eth1Id, '10.0.1.1', 24);
      expect(graph.getInterfaceNetwork(rid, eth1Id)).toBe('10.0.1.0');
      expect(graph.getInterfaceBroadcast(rid, eth1Id)).toBe('10.0.1.255');

      const n0 = graph.getInterfaceNetwork(rid, eth0Id);
      const n1 = graph.getInterfaceNetwork(rid, eth1Id);
      expect(n0).not.toBe(n1);
    });

    it('eth2 192.168.1.1/30 → network 192.168.1.0 broadcast 192.168.1.3', () => {
      graph.setInterfaceIp(rid, eth2Id, '192.168.1.1', 30);
      expect(graph.getInterfaceNetwork(rid, eth2Id)).toBe('192.168.1.0');
      expect(graph.getInterfaceBroadcast(rid, eth2Id)).toBe('192.168.1.3');

      const subnet = graph.getInterfaceSubnet(rid, eth2Id)!;
      // /30 valid hosts: .1 and .2
      expect(subnet.isValidHost('192.168.1.1')).toBe(true);
      expect(subnet.isValidHost('192.168.1.2')).toBe(true);
      expect(subnet.isValidHost('192.168.1.0')).toBe(false); // network
      expect(subnet.isValidHost('192.168.1.3')).toBe(false); // broadcast
    });

    it('all three interfaces compute their subnets independently (no cross-interference)', () => {
      graph.setInterfaceCidr(rid, eth0Id, '10.0.0.1/24');
      graph.setInterfaceCidr(rid, eth1Id, '10.0.1.1/24');
      graph.setInterfaceCidr(rid, eth2Id, '192.168.1.1/30');

      expect(graph.getInterfaceNetwork(rid, eth0Id)).toBe('10.0.0.0');
      expect(graph.getInterfaceNetwork(rid, eth1Id)).toBe('10.0.1.0');
      expect(graph.getInterfaceNetwork(rid, eth2Id)).toBe('192.168.1.0');

      // MACs and IDs remain unchanged
      expect(graph.getInterface(rid, eth0Id)!.name).toBe('eth0');
      expect(graph.getInterface(rid, eth1Id)!.name).toBe('eth1');
      expect(graph.getInterface(rid, eth2Id)!.name).toBe('eth2');

      // All IDs distinct
      expect(eth0Id).not.toBe(eth1Id);
      expect(eth1Id).not.toBe(eth2Id);
      expect(eth0Id).not.toBe(eth2Id);
    });
  });

  describe('Edge cases: /31 and /32 semantics on interfaces', () => {
    it('/32 single-address: network = broadcast = address, host is valid', () => {
      const pc = factory.createPc({ name: 'PC' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '5.5.5.5', 32);
      const iface = graph.getInterface(pc.value.deviceId, pc.value.eth0Id);
      expect(iface!.prefixLength).toBe(32);
      expect(graph.getInterfaceNetwork(pc.value.deviceId, pc.value.eth0Id)).toBe('5.5.5.5');
      expect(graph.getInterfaceBroadcast(pc.value.deviceId, pc.value.eth0Id)).toBe('5.5.5.5');
      expect(graph.isInterfaceHostValid(pc.value.deviceId, pc.value.eth0Id)).toBe(true);
    });

    it('/31 point-to-point: both addresses are valid hosts', () => {
      const pc = factory.createPc({ name: 'PC' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '10.0.0.2', 31);
      expect(graph.getInterfaceNetwork(pc.value.deviceId, pc.value.eth0Id)).toBe('10.0.0.2');
      expect(graph.getInterfaceBroadcast(pc.value.deviceId, pc.value.eth0Id)).toBe('10.0.0.3');
      expect(graph.isInterfaceHostValid(pc.value.deviceId, pc.value.eth0Id)).toBe(true);

      const subnet = graph.getInterfaceSubnet(pc.value.deviceId, pc.value.eth0Id)!;
      expect(subnet.isValidHost('10.0.0.2')).toBe(true);
      expect(subnet.isValidHost('10.0.0.3')).toBe(true);
    });
  });

  describe('Host validation: /24 network/broadcast NOT valid hosts', () => {
    it('setting network address (192.168.1.0) correctly flags NOT a host', () => {
      const pc = factory.createPc({ name: 'PC' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '192.168.1.0', 24);
      expect(graph.isInterfaceHostValid(pc.value.deviceId, pc.value.eth0Id)).toBe(false);
    });

    it('setting broadcast address (192.168.1.255) correctly flags NOT a host', () => {
      const pc = factory.createPc({ name: 'PC' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '192.168.1.255', 24);
      expect(graph.isInterfaceHostValid(pc.value.deviceId, pc.value.eth0Id)).toBe(false);
    });
  });

  describe('Changing IP does NOT mutate unrelated fields', () => {
    it('reassigning IP recalculates subnet, does not change MAC/ID/neighbors', () => {
      const pc = factory.createPc({ name: 'PC' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      const ifaceBefore = graph.getInterface(pc.value.deviceId, pc.value.eth0Id)!;
      const macBefore = ifaceBefore.macAddress;
      const idBefore = ifaceBefore.id;

      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '10.0.0.1', 24);
      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '10.0.1.1', 24);

      const ifaceAfter = graph.getInterface(pc.value.deviceId, pc.value.eth0Id)!;
      expect(ifaceAfter.id).toBe(idBefore);
      expect(ifaceAfter.macAddress).toBe(macBefore);
      expect(ifaceAfter.ipAddress).toBe('10.0.1.1');
      expect(ifaceAfter.prefixLength).toBe(24);
      expect(graph.getInterfaceNetwork(pc.value.deviceId, pc.value.eth0Id)).toBe('10.0.1.0');
    });
  });

  describe('Serialization: derived values are not stored but calculated', () => {
    it('snapshot contains stored address and prefix; network/broadcast are derived', () => {
      const pc = factory.createPc({ name: 'PC1' });
      expect(pc.ok).toBe(true);
      if (!pc.ok) return;

      graph.setInterfaceIp(pc.value.deviceId, pc.value.eth0Id, '192.168.1.37', 24);

      const snap = graph.snapshot();
      const snapIface = snap.devices.get(pc.value.deviceId)!.interfaces.get(pc.value.eth0Id)!;

      // Stored fields
      expect(snapIface.ipAddress).toBe('192.168.1.37');
      expect(snapIface.prefixLength).toBe(24);
      expect(snapIface.subnetMask).toBe('255.255.255.0');

      // Derived — calculate fresh from snapshot values
      const subnetFromSnap = IPv4Subnet.create(snapIface.ipAddress!, snapIface.prefixLength!);
      expect(subnetFromSnap.ok).toBe(true);
      if (subnetFromSnap.ok) {
        expect(subnetFromSnap.value.networkAddress).toBe('192.168.1.0');
        expect(subnetFromSnap.value.broadcastAddress).toBe('192.168.1.255');
      }
    });
  });

  describe('Determinism: same inputs always give same results', () => {
    it('192.168.1.37/24 always → network 192.168.1.0, broadcast 192.168.1.255', () => {
      for (let i = 0; i < 50; i++) {
        const subnetRes = IPv4Subnet.create('192.168.1.37', 24);
        expect(subnetRes.ok).toBe(true);
        if (subnetRes.ok) {
          expect(subnetRes.value.networkAddress).toBe('192.168.1.0');
          expect(subnetRes.value.broadcastAddress).toBe('192.168.1.255');
        }
      }
    });
  });
});
