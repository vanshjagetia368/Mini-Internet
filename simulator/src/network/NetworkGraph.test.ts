import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkGraph } from './NetworkGraph.js';
import { EventBus } from '../events/EventBus.js';
import type { DeviceId, InterfaceId } from '../types/ids.js';

describe('NetworkGraph', () => {
  let eventBus: EventBus;
  let graph: NetworkGraph;

  beforeEach(() => {
    eventBus = new EventBus();
    graph = new NetworkGraph('net-1', 'Test Network', eventBus);
  });

  describe('Device and Interface Creation', () => {
    it('should add a PC with default loopback and eth0', () => {
      const result = graph.addPc('PC1');
      expect(result.ok).toBe(true);

      if (result.ok) {
        const device = graph.getDevice(result.value);
        expect(device).toBeDefined();
        expect(device?.name).toBe('PC1');
        expect(device?.type).toBe('PC');
        expect(device?.status).toBe('UP');
        expect(device?.interfaces.size).toBe(2);

        const ifaces = Array.from(device!.interfaces.values());
        expect(ifaces.find((i) => i.name === 'lo')).toBeDefined();
        expect(ifaces.find((i) => i.name === 'eth0')).toBeDefined();

        const lo = ifaces.find((i) => i.name === 'lo')!;
        expect(lo.macAddress).toBe('00:00:00:00:00:00');
      }
    });

    it('should add a Router with only a loopback by default', () => {
      const result = graph.addRouter('R1');
      expect(result.ok).toBe(true);

      if (result.ok) {
        const device = graph.getDevice(result.value);
        expect(device?.type).toBe('ROUTER');
        expect(device?.interfaces.size).toBe(1);
        expect(Array.from(device!.interfaces.values())[0].name).toBe('lo');

        // hasDevice check
        expect(graph.hasDevice(result.value)).toBe(true);
        expect(graph.hasDevice('unknown-id' as DeviceId)).toBe(false);
      }
    });

    it('should allow adding custom interfaces and validate duplicates', () => {
      const pc = graph.addPc('PC1');
      if (!pc.ok) throw new Error('Failed to add PC');

      const addResult = graph.addInterface(pc.value, 'eth1');
      expect(addResult.ok).toBe(true);

      const duplicateResult = graph.addInterface(pc.value, 'eth1');
      expect(duplicateResult.ok).toBe(false);
      if (!duplicateResult.ok) {
        expect(duplicateResult.error.code).toBe('DUPLICATE_INTERFACE');
      }
    });

    it('should validate MAC address when adding interface', () => {
      const r1 = graph.addRouter('R1');
      if (!r1.ok) throw new Error('Failed to add Router');

      const result = graph.addInterface(r1.value, 'eth0', 'invalid-mac');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_MAC_ADDRESS');
      }
    });
  });

  describe('Link Creation and Validation', () => {
    it('should create a valid link between two devices', () => {
      const pc = graph.addPc('PC1');
      const server = graph.addServer('Server1');
      if (!pc.ok || !server.ok) throw new Error('Setup failed');

      const pcEth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const serverEth0 = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const linkResult = graph.addLink(pcEth0.id, serverEth0.id);
      expect(linkResult.ok).toBe(true);

      if (linkResult.ok) {
        const link = graph.getLink(linkResult.value);
        expect(link).toBeDefined();
        expect(link?.endpointA).toBe(pcEth0.id);
        expect(link?.endpointB).toBe(serverEth0.id);
        expect(link?.status).toBe('UP');

        // hasLink check
        expect(graph.hasLink(linkResult.value)).toBe(true);
        expect(graph.hasLink('unknown-link' as import('../types/ids.js').LinkId)).toBe(false);
      }
    });

    it('should prevent self-links', () => {
      const pc = graph.addPc('PC1');
      if (!pc.ok) throw new Error('Setup failed');

      const eth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const linkResult = graph.addLink(eth0.id, eth0.id);
      expect(linkResult.ok).toBe(false);
      if (!linkResult.ok) {
        expect(linkResult.error.code).toBe('INVALID_TOPOLOGY');
      }
    });

    it('should prevent connecting an already connected interface', () => {
      const pc1 = graph.addPc('PC1');
      const r1 = graph.addRouter('R1');
      const r2 = graph.addRouter('R2');
      if (!pc1.ok || !r1.ok || !r2.ok) throw new Error('Setup failed');

      const r1Eth0Result = graph.addInterface(r1.value, 'eth0');
      const r2Eth0Result = graph.addInterface(r2.value, 'eth0');
      if (!r1Eth0Result.ok || !r2Eth0Result.ok) throw new Error('Interface creation failed');

      const pc1Eth0 = Array.from(graph.getDevice(pc1.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const link1 = graph.addLink(pc1Eth0.id, r1Eth0Result.value);
      expect(link1.ok).toBe(true);

      const link2 = graph.addLink(pc1Eth0.id, r2Eth0Result.value);
      expect(link2.ok).toBe(false);
      if (!link2.ok) {
        expect(link2.error.code).toBe('INVALID_TOPOLOGY');
      }
    });
  });

  describe('Adjacency and Graph Traversal', () => {
    it('should resolve neighbors correctly', () => {
      // Topology:
      // PC1 --- R1 --- Server1
      //         |
      //         R2

      const pc1 = graph.addPc('PC1');
      const r1 = graph.addRouter('R1');
      const r2 = graph.addRouter('R2');
      const server1 = graph.addServer('Server1');

      if (!pc1.ok || !r1.ok || !r2.ok || !server1.ok) throw new Error('Setup failed');

      const pc1Eth0 = Array.from(graph.getDevice(pc1.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const server1Eth0 = Array.from(graph.getDevice(server1.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const r1Eth0 = graph.addInterface(r1.value, 'eth0');
      const r1Eth1 = graph.addInterface(r1.value, 'eth1');
      const r1Eth2 = graph.addInterface(r1.value, 'eth2');
      const r2Eth0 = graph.addInterface(r2.value, 'eth0');

      if (!r1Eth0.ok || !r1Eth1.ok || !r1Eth2.ok || !r2Eth0.ok)
        throw new Error('Interface setup failed');

      graph.addLink(pc1Eth0.id, r1Eth0.value);
      graph.addLink(server1Eth0.id, r1Eth1.value);
      graph.addLink(r1Eth2.value, r2Eth0.value);

      // Check R1 neighbors (should be PC1, Server1, R2)
      const r1Neighbors = graph.getNeighbors(r1.value);
      expect(r1Neighbors.length).toBe(3);

      const neighborIds = r1Neighbors.map((n) => n.deviceId);
      expect(neighborIds).toContain(pc1.value);
      expect(neighborIds).toContain(server1.value);
      expect(neighborIds).toContain(r2.value);

      // Check PC1 neighbors (should be R1)
      const pc1Neighbors = graph.getNeighbors(pc1.value);
      expect(pc1Neighbors.length).toBe(1);
      expect(pc1Neighbors[0].deviceId).toBe(r1.value);
      expect(pc1Neighbors[0].localInterface.id).toBe(pc1Eth0.id);
      expect(pc1Neighbors[0].remoteInterface.id).toBe(r1Eth0.value);
    });

    it('should resolve connected links and link between devices', () => {
      const pc1 = graph.addPc('PC1');
      const r1 = graph.addRouter('R1');
      const server1 = graph.addServer('Server1');

      if (!pc1.ok || !r1.ok || !server1.ok) throw new Error('Setup failed');

      const pc1Eth0 = Array.from(graph.getDevice(pc1.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const server1Eth0 = Array.from(graph.getDevice(server1.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const r1Eth0 = graph.addInterface(r1.value, 'eth0');
      const r1Eth1 = graph.addInterface(r1.value, 'eth1');
      if (!r1Eth0.ok || !r1Eth1.ok) throw new Error('Interface setup failed');

      const link1 = graph.addLink(pc1Eth0.id, r1Eth0.value);
      const link2 = graph.addLink(r1Eth1.value, server1Eth0.id);
      if (!link1.ok || !link2.ok) throw new Error('Link setup failed');

      // getConnectedLinks test
      const r1Links = graph.getConnectedLinks(r1.value);
      expect(r1Links.length).toBe(2);
      expect(r1Links.map((l) => l.id)).toContain(link1.value);
      expect(r1Links.map((l) => l.id)).toContain(link2.value);

      const pc1Links = graph.getConnectedLinks(pc1.value);
      expect(pc1Links.length).toBe(1);
      expect(pc1Links[0].id).toBe(link1.value);

      // getLinkBetween test
      const linkBetweenPc1R1 = graph.getLinkBetween(pc1.value, r1.value);
      expect(linkBetweenPc1R1).toBeDefined();
      expect(linkBetweenPc1R1?.id).toBe(link1.value);

      const linkBetweenR1Pc1 = graph.getLinkBetween(r1.value, pc1.value);
      expect(linkBetweenR1Pc1).toBeDefined();
      expect(linkBetweenR1Pc1?.id).toBe(link1.value);

      // Unconnected devices
      const linkBetweenPc1Server1 = graph.getLinkBetween(pc1.value, server1.value);
      expect(linkBetweenPc1Server1).toBeUndefined();
    });

    it('should keep disconnected subgraphs isolated', () => {
      // A -- B    C -- D
      const a = graph.addPc('A');
      const b = graph.addRouter('B');
      const c = graph.addRouter('C');
      const d = graph.addPc('D');

      if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error('Setup failed');

      const aEth0 = Array.from(graph.getDevice(a.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const bEth0 = graph.addInterface(b.value, 'eth0');
      const cEth0 = graph.addInterface(c.value, 'eth0');
      const dEth0 = Array.from(graph.getDevice(d.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      if (!bEth0.ok || !cEth0.ok) throw new Error('Interface setup failed');

      graph.addLink(aEth0.id, bEth0.value);
      graph.addLink(cEth0.value, dEth0.id);

      expect(graph.getNeighbors(a.value).map((n) => n.deviceId)).toEqual([b.value]);
      expect(graph.getNeighbors(c.value).map((n) => n.deviceId)).toEqual([d.value]);

      // No crossover
      expect(graph.getLinkBetween(a.value, c.value)).toBeUndefined();
    });
  });

  describe('Removals and Consistency', () => {
    it('should cascade link removal when a device is removed', () => {
      const pc = graph.addPc('PC1');
      const server = graph.addServer('Server1');
      if (!pc.ok || !server.ok) throw new Error('Setup failed');

      const pcEth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const serverEth0 = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const linkResult = graph.addLink(pcEth0.id, serverEth0.id);
      expect(linkResult.ok).toBe(true);

      const linkId = linkResult.ok ? linkResult.value : '';

      // Remove PC
      const removeResult = graph.removeDevice(pc.value);
      expect(removeResult.ok).toBe(true);

      // Link should be removed
      expect(graph.getLink(linkId)).toBeUndefined();

      // Server eth0 should no longer be connected
      const serverEth0After = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      expect(serverEth0After.connectedLinkId).toBeNull();

      // Server neighbors should be 0
      expect(graph.getNeighbors(server.value).length).toBe(0);
    });

    it('should remove a link without deleting devices', () => {
      const pc = graph.addPc('PC1');
      const server = graph.addServer('Server1');
      if (!pc.ok || !server.ok) throw new Error('Setup failed');

      const pcEth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const serverEth0 = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const linkResult = graph.addLink(pcEth0.id, serverEth0.id);
      if (!linkResult.ok) throw new Error('Link failed');

      graph.removeLink(linkResult.value);

      expect(graph.getLink(linkResult.value)).toBeUndefined();
      expect(graph.getDevice(pc.value)).toBeDefined();
      expect(graph.getDevice(server.value)).toBeDefined();

      const pcEth0After = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      expect(pcEth0After.connectedLinkId).toBeNull();
    });
  });

  describe('Failure States', () => {
    it('should allow setting device to DOWN and UP without removing it', () => {
      const pc = graph.addPc('PC1');
      if (!pc.ok) throw new Error('Setup failed');

      graph.failDevice(pc.value);
      expect(graph.getDevice(pc.value)?.status).toBe('DOWN');
      expect(graph.deviceIds()).toContain(pc.value); // DOWN != deleted

      graph.recoverDevice(pc.value);
      expect(graph.getDevice(pc.value)?.status).toBe('UP');
    });

    it('should allow setting link to DOWN and UP without removing it', () => {
      const pc = graph.addPc('PC1');
      const server = graph.addServer('Server1');
      if (!pc.ok || !server.ok) throw new Error('Setup failed');

      const pcEth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const serverEth0 = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const link = graph.addLink(pcEth0.id, serverEth0.id);
      if (!link.ok) throw new Error('Link setup failed');

      graph.failLink(link.value);
      expect(graph.getLink(link.value)?.status).toBe('DOWN');
      expect(graph.linkIds()).toContain(link.value); // DOWN != deleted

      graph.recoverLink(link.value);
      expect(graph.getLink(link.value)?.status).toBe('UP');
    });
  });

  describe('Snapshot Serialization', () => {
    it('should generate a correct snapshot structure', () => {
      const pc = graph.addPc('PC1');
      if (!pc.ok) throw new Error('Setup failed');

      const snapshot = graph.snapshot();
      expect(snapshot.id).toBe('net-1');
      expect(snapshot.name).toBe('Test Network');
      expect(snapshot.devices.has(pc.value)).toBe(true);

      // Ensure modifying the snapshot does not modify the graph
      snapshot.devices.delete(pc.value);
      expect(graph.getDevice(pc.value)).toBeDefined();
    });
  });

  describe('Device Type Queries', () => {
    it('should return all routers in the network', () => {
      const r1 = graph.addRouter('R1');
      const r2 = graph.addRouter('R2');
      const pc = graph.addPc('PC1');
      const server = graph.addServer('Server1');

      if (!r1.ok || !r2.ok || !pc.ok || !server.ok) throw new Error('Setup failed');

      const routers = graph.getRouters();
      expect(routers.length).toBe(2);
      expect(routers.map((r) => r.id)).toContain(r1.value);
      expect(routers.map((r) => r.id)).toContain(r2.value);
      expect(routers.every((r) => r.type === 'ROUTER')).toBe(true);
    });

    it('should return all PCs in the network', () => {
      const pc1 = graph.addPc('PC1');
      const pc2 = graph.addPc('PC2');
      const router = graph.addRouter('R1');

      if (!pc1.ok || !pc2.ok || !router.ok) throw new Error('Setup failed');

      const pcs = graph.getPcs();
      expect(pcs.length).toBe(2);
      expect(pcs.map((p) => p.id)).toContain(pc1.value);
      expect(pcs.map((p) => p.id)).toContain(pc2.value);
      expect(pcs.every((p) => p.type === 'PC')).toBe(true);
    });

    it('should return all servers in the network', () => {
      const server1 = graph.addServer('Server1');
      const server2 = graph.addServer('Server2');
      const pc = graph.addPc('PC1');

      if (!server1.ok || !server2.ok || !pc.ok) throw new Error('Setup failed');

      const servers = graph.getServers();
      expect(servers.length).toBe(2);
      expect(servers.map((s) => s.id)).toContain(server1.value);
      expect(servers.map((s) => s.id)).toContain(server2.value);
      expect(servers.every((s) => s.type === 'SERVER')).toBe(true);
    });

    it('should return empty arrays when no devices of a type exist', () => {
      const pc = graph.addPc('PC1');
      if (!pc.ok) throw new Error('Setup failed');

      expect(graph.getRouters()).toEqual([]);
      expect(graph.getServers()).toEqual([]);
      expect(graph.getPcs().length).toBe(1);
    });
  });

  describe('Device Lookup by Name', () => {
    it('should find device by name', () => {
      const pc = graph.addPc('TestPC');
      if (!pc.ok) throw new Error('Setup failed');

      const device = graph.getDeviceByName('TestPC');
      expect(device).toBeDefined();
      expect(device?.name).toBe('TestPC');
      expect(device?.id).toBe(pc.value);
    });

    it('should return undefined for non-existent device name', () => {
      const device = graph.getDeviceByName('NonExistent');
      expect(device).toBeUndefined();
    });

    it('should handle duplicate device names with error', () => {
      const pc1 = graph.addPc('DuplicateName');
      if (!pc1.ok) throw new Error('Setup failed');

      const pc2 = graph.addPc('DuplicateName');
      expect(pc2.ok).toBe(false);
      if (!pc2.ok) {
        expect(pc2.error.code).toBe('DUPLICATE_ENTITY');
      }
    });
  });

  describe('Interface Management', () => {
    it('should get a specific interface from a device', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const eth0 = graph.addInterface(router.value, 'eth0');
      if (!eth0.ok) throw new Error('Interface creation failed');

      const iface = graph.getInterface(router.value, eth0.value);
      expect(iface).toBeDefined();
      expect(iface?.name).toBe('eth0');
      expect(iface?.deviceId).toBe(router.value);
    });

    it('should return undefined for non-existent interface', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const iface = graph.getInterface(router.value, 'non-existent' as InterfaceId);
      expect(iface).toBeUndefined();
    });

    it('should check if device has interface', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const eth0 = graph.addInterface(router.value, 'eth0');
      if (!eth0.ok) throw new Error('Interface creation failed');

      expect(graph.hasInterface(router.value, eth0.value)).toBe(true);
      expect(graph.hasInterface(router.value, 'non-existent' as InterfaceId)).toBe(false);
    });

    it('should get all interfaces for a device', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const eth0 = graph.addInterface(router.value, 'eth0');
      const eth1 = graph.addInterface(router.value, 'eth1');
      const eth2 = graph.addInterface(router.value, 'eth2');
      if (!eth0.ok || !eth1.ok || !eth2.ok) throw new Error('Interface creation failed');

      const interfaces = graph.getInterfaces(router.value);
      expect(interfaces.length).toBe(4); // lo + eth0 + eth1 + eth2
      expect(interfaces.map((i) => i.name)).toContain('lo');
      expect(interfaces.map((i) => i.name)).toContain('eth0');
      expect(interfaces.map((i) => i.name)).toContain('eth1');
      expect(interfaces.map((i) => i.name)).toContain('eth2');
    });

    it('should remove an interface from a device', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const eth0 = graph.addInterface(router.value, 'eth0');
      if (!eth0.ok) throw new Error('Interface creation failed');

      const removeResult = graph.removeInterface(router.value, eth0.value);
      expect(removeResult.ok).toBe(true);

      expect(graph.getInterface(router.value, eth0.value)).toBeUndefined();
      expect(graph.hasInterface(router.value, eth0.value)).toBe(false);
      expect(graph.getInterfaces(router.value).length).toBe(1); // Only lo remains
    });

    it('should reject removal of connected interface', () => {
      const pc1 = graph.addPc('PC1');
      const pc2 = graph.addPc('PC2');
      if (!pc1.ok || !pc2.ok) throw new Error('Setup failed');

      const pc1Eth0 = Array.from(graph.getDevice(pc1.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const pc2Eth0 = Array.from(graph.getDevice(pc2.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      const link = graph.addLink(pc1Eth0.id, pc2Eth0.id);
      if (!link.ok) throw new Error('Link creation failed');

      const removeResult = graph.removeInterface(pc1.value, pc1Eth0.id);
      expect(removeResult.ok).toBe(false);
      if (!removeResult.ok) {
        expect(removeResult.error.code).toBe('INVALID_TOPOLOGY');
      }
    });

    it('should fail and recover interface status independently of device', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const eth0 = graph.addInterface(router.value, 'eth0');
      if (!eth0.ok) throw new Error('Interface creation failed');

      // Fail interface
      graph.failInterface(router.value, eth0.value);
      expect(graph.getInterface(router.value, eth0.value)?.status).toBe('DOWN');
      expect(graph.getDevice(router.value)?.status).toBe('UP'); // Device still UP

      // Recover interface
      graph.recoverInterface(router.value, eth0.value);
      expect(graph.getInterface(router.value, eth0.value)?.status).toBe('UP');
    });
  });

  describe('Router Multi-Interface', () => {
    it('should support router with multiple interfaces', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const eth0 = graph.addInterface(router.value, 'eth0', '00:1A:2B:3C:4D:5E');
      const eth1 = graph.addInterface(router.value, 'eth1', '00:1A:2B:3C:4D:5F');
      const eth2 = graph.addInterface(router.value, 'eth2', '00:1A:2B:3C:4D:60');

      if (!eth0.ok || !eth1.ok || !eth2.ok) throw new Error('Interface creation failed');

      const interfaces = graph.getInterfaces(router.value);
      expect(interfaces.length).toBe(4); // lo + eth0 + eth1 + eth2

      // Verify each interface has distinct MAC
      const macs = interfaces.map((i) => i.macAddress);
      const uniqueMacs = new Set(macs);
      expect(uniqueMacs.size).toBe(4);
    });

    it('should allow each interface to have different IP configuration', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const eth0 = graph.addInterface(router.value, 'eth0');
      const eth1 = graph.addInterface(router.value, 'eth1');
      if (!eth0.ok || !eth1.ok) throw new Error('Interface creation failed');

      // Note: IP configuration would be set via separate commands in future
      // For now, we verify interfaces are independently addressable
      const iface0 = graph.getInterface(router.value, eth0.value);
      const iface1 = graph.getInterface(router.value, eth1.value);

      expect(iface0?.id).not.toBe(iface1?.id);
      expect(iface0?.name).not.toBe(iface1?.name);
    });
  });

  describe('Network Consistency', () => {
    it('should maintain consistency after device addition', () => {
      const pc = graph.addPc('PC1');
      if (!pc.ok) throw new Error('Setup failed');

      // Device should be in graph
      expect(graph.hasDevice(pc.value)).toBe(true);
      expect(graph.deviceIds()).toContain(pc.value);

      // Snapshot should include device
      const snapshot = graph.snapshot();
      expect(snapshot.devices.has(pc.value)).toBe(true);
    });

    it('should maintain consistency after device removal', () => {
      const pc = graph.addPc('PC1');
      if (!pc.ok) throw new Error('Setup failed');

      graph.removeDevice(pc.value);

      // Device should not be in graph
      expect(graph.hasDevice(pc.value)).toBe(false);
      expect(graph.deviceIds()).not.toContain(pc.value);

      // Snapshot should not include device
      const snapshot = graph.snapshot();
      expect(snapshot.devices.has(pc.value)).toBe(false);
    });

    it('should maintain consistency after interface removal', () => {
      const router = graph.addRouter('R1');
      if (!router.ok) throw new Error('Setup failed');

      const eth0 = graph.addInterface(router.value, 'eth0');
      if (!eth0.ok) throw new Error('Interface creation failed');

      graph.removeInterface(router.value, eth0.value);

      // Interface should not exist
      expect(graph.hasInterface(router.value, eth0.value)).toBe(false);

      // Device should still exist
      expect(graph.hasDevice(router.value)).toBe(true);
    });
  });
});
