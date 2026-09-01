import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkGraph } from './NetworkGraph.js';
import { EventBus } from '../events/EventBus.js';

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

      const pcEth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(i => i.name === 'eth0')!;
      const serverEth0 = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(i => i.name === 'eth0')!;

      const linkResult = graph.addLink(pcEth0.id, serverEth0.id);
      expect(linkResult.ok).toBe(true);

      if (linkResult.ok) {
        const link = graph.getLink(linkResult.value);
        expect(link).toBeDefined();
        expect(link?.endpointA).toBe(pcEth0.id);
        expect(link?.endpointB).toBe(serverEth0.id);
        expect(link?.status).toBe('UP');
      }
    });

    it('should prevent self-links', () => {
      const pc = graph.addPc('PC1');
      if (!pc.ok) throw new Error('Setup failed');

      const eth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(i => i.name === 'eth0')!;
      
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

      const pc1Eth0 = Array.from(graph.getDevice(pc1.value)!.interfaces.values()).find(i => i.name === 'eth0')!;

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

      const pc1Eth0 = Array.from(graph.getDevice(pc1.value)!.interfaces.values()).find(i => i.name === 'eth0')!;
      const server1Eth0 = Array.from(graph.getDevice(server1.value)!.interfaces.values()).find(i => i.name === 'eth0')!;

      const r1Eth0 = graph.addInterface(r1.value, 'eth0');
      const r1Eth1 = graph.addInterface(r1.value, 'eth1');
      const r1Eth2 = graph.addInterface(r1.value, 'eth2');
      const r2Eth0 = graph.addInterface(r2.value, 'eth0');

      if (!r1Eth0.ok || !r1Eth1.ok || !r1Eth2.ok || !r2Eth0.ok) throw new Error('Interface setup failed');

      graph.addLink(pc1Eth0.id, r1Eth0.value);
      graph.addLink(server1Eth0.id, r1Eth1.value);
      graph.addLink(r1Eth2.value, r2Eth0.value);

      // Check R1 neighbors (should be PC1, Server1, R2)
      const r1Neighbors = graph.getNeighbors(r1.value);
      expect(r1Neighbors.length).toBe(3);
      
      const neighborIds = r1Neighbors.map(n => n.deviceId);
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
  });

  describe('Removals and Consistency', () => {
    it('should cascade link removal when a device is removed', () => {
      const pc = graph.addPc('PC1');
      const server = graph.addServer('Server1');
      if (!pc.ok || !server.ok) throw new Error('Setup failed');

      const pcEth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(i => i.name === 'eth0')!;
      const serverEth0 = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(i => i.name === 'eth0')!;

      const linkResult = graph.addLink(pcEth0.id, serverEth0.id);
      expect(linkResult.ok).toBe(true);

      const linkId = linkResult.ok ? linkResult.value : '';

      // Remove PC
      const removeResult = graph.removeDevice(pc.value);
      expect(removeResult.ok).toBe(true);

      // Link should be removed
      expect(graph.getLink(linkId)).toBeUndefined();

      // Server eth0 should no longer be connected
      const serverEth0After = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(i => i.name === 'eth0')!;
      expect(serverEth0After.connectedLinkId).toBeNull();
      
      // Server neighbors should be 0
      expect(graph.getNeighbors(server.value).length).toBe(0);
    });

    it('should remove a link without deleting devices', () => {
      const pc = graph.addPc('PC1');
      const server = graph.addServer('Server1');
      if (!pc.ok || !server.ok) throw new Error('Setup failed');

      const pcEth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(i => i.name === 'eth0')!;
      const serverEth0 = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(i => i.name === 'eth0')!;

      const linkResult = graph.addLink(pcEth0.id, serverEth0.id);
      if (!linkResult.ok) throw new Error('Link failed');

      graph.removeLink(linkResult.value);

      expect(graph.getLink(linkResult.value)).toBeUndefined();
      expect(graph.getDevice(pc.value)).toBeDefined();
      expect(graph.getDevice(server.value)).toBeDefined();

      const pcEth0After = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(i => i.name === 'eth0')!;
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

      const pcEth0 = Array.from(graph.getDevice(pc.value)!.interfaces.values()).find(i => i.name === 'eth0')!;
      const serverEth0 = Array.from(graph.getDevice(server.value)!.interfaces.values()).find(i => i.name === 'eth0')!;

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
});
