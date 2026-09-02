import { describe, it, expect, beforeEach } from 'vitest';
import { PacketEngine } from './PacketEngine.js';
import { NetworkGraph } from '../network/NetworkGraph.js';
import { EventBus } from '../events/EventBus.js';
import type { DeviceId, PacketId } from '../types/ids.js';
import type { PacketDropReason } from './PacketDropReason.js';

describe('PacketEngine', () => {
  let eventBus: EventBus;
  let graph: NetworkGraph;
  let packetEngine: PacketEngine;

  beforeEach(() => {
    eventBus = new EventBus();
    graph = new NetworkGraph('net-1', 'Test Network', eventBus);
    packetEngine = new PacketEngine(graph, eventBus);
  });

  // ── Test Network Setup Helpers ───────────────────────────────────────────────

  function setupSimpleNetwork() {
    const pc1 = graph.addPc('PC1');
    const r1 = graph.addRouter('R1');
    const server1 = graph.addServer('Server1');

    if (!pc1.ok || !r1.ok || !server1.ok) {
      throw new Error('Failed to create devices');
    }

    const r1Eth0 = graph.addInterface(r1.value, 'eth0');
    const r1Eth1 = graph.addInterface(r1.value, 'eth1');

    if (!r1Eth0.ok || !r1Eth1.ok) {
      throw new Error('Failed to create router interfaces');
    }

    const pc1Eth0 = Array.from(graph.getDevice(pc1.value)!.interfaces.values()).find(
      (i) => i.name === 'eth0',
    )!;
    const server1Eth0 = Array.from(graph.getDevice(server1.value)!.interfaces.values()).find(
      (i) => i.name === 'eth0',
    )!;

    graph.addLink(pc1Eth0.id, r1Eth0.value);
    graph.addLink(server1Eth0.id, r1Eth1.value);

    return { pc1: pc1.value, r1: r1.value, server1: server1.value };
  }

  function setupMultiHopNetwork() {
    const pc1 = graph.addPc('PC1');
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server1 = graph.addServer('Server1');

    if (!pc1.ok || !r1.ok || !r2.ok || !server1.ok) {
      throw new Error('Failed to create devices');
    }

    const r1Eth0 = graph.addInterface(r1.value, 'eth0');
    const r1Eth1 = graph.addInterface(r1.value, 'eth1');
    const r2Eth0 = graph.addInterface(r2.value, 'eth0');
    const r2Eth1 = graph.addInterface(r2.value, 'eth1');

    if (!r1Eth0.ok || !r1Eth1.ok || !r2Eth0.ok || !r2Eth1.ok) {
      throw new Error('Failed to create router interfaces');
    }

    const pc1Eth0 = Array.from(graph.getDevice(pc1.value)!.interfaces.values()).find(
      (i) => i.name === 'eth0',
    )!;
    const server1Eth0 = Array.from(graph.getDevice(server1.value)!.interfaces.values()).find(
      (i) => i.name === 'eth0',
    )!;

    graph.addLink(pc1Eth0.id, r1Eth0.value);
    graph.addLink(r1Eth1.value, r2Eth0.value);
    graph.addLink(r2Eth1.value, server1Eth0.id);

    return { pc1: pc1.value, r1: r1.value, r2: r2.value, server1: server1.value };
  }

  // ── Packet Creation Tests ─────────────────────────────────────────────────────

  describe('Packet Creation', () => {
    it('should create a valid packet with all fields', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const result = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Hello Server',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBeDefined();
        expect(result.value.sourceDeviceId).toBe(pc1);
        expect(result.value.destinationDeviceId).toBe(server1);
        expect(result.value.sourceIp).toBe('192.168.1.10');
        expect(result.value.destinationIp).toBe('10.0.1.10');
        expect(result.value.payload).toBe('Hello Server');
        expect(result.value.currentLocation).toBe(pc1);
        expect(result.value.state).toBe('CREATED');
        expect(result.value.history).toEqual([pc1]);
        expect(result.value.lifecycleHistory).toEqual([]);
        expect(result.value.createdAt).toBeDefined();
      }
    });

    it('should generate unique IDs for different packets', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const packet1 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Packet 1',
      });

      const packet2 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Packet 2',
      });

      expect(packet1.ok).toBe(true);
      expect(packet2.ok).toBe(true);
      if (packet1.ok && packet2.ok) {
        expect(packet1.value.id).not.toBe(packet2.value.id);
      }
    });

    it('should reject packet with invalid source device', () => {
      const { server1 } = setupSimpleNetwork();
      const invalidDeviceId = 'invalid-device-id' as DeviceId;

      const result = packetEngine.createPacket({
        sourceDeviceId: invalidDeviceId,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENTITY_NOT_FOUND');
      }
    });

    it('should reject packet with invalid destination device', () => {
      const { pc1 } = setupSimpleNetwork();
      const invalidDeviceId = 'invalid-device-id' as DeviceId;

      const result = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: invalidDeviceId,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENTITY_NOT_FOUND');
      }
    });

    it('should reject packet with invalid source IP format', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const result = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: 'invalid-ip',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_IPV4_ADDRESS');
      }
    });

    it('should reject packet with invalid destination IP format', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const result = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: 'invalid-ip',
        payload: 'Test',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_IPV4_ADDRESS');
      }
    });

    it('should allow source = destination (local delivery)', () => {
      const { pc1 } = setupSimpleNetwork();

      const result = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: pc1,
        sourceIp: '192.168.1.10',
        destinationIp: '192.168.1.10',
        payload: 'Local delivery',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sourceDeviceId).toBe(pc1);
        expect(result.value.destinationDeviceId).toBe(pc1);
        expect(result.value.currentLocation).toBe(pc1);
      }
    });

    it('should support metadata in packet creation', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const result = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
        metadata: { priority: 'high', qos: 1 },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata).toEqual({ priority: 'high', qos: 1 });
      }
    });
  });

  // ── Packet Send Tests ────────────────────────────────────────────────────────

  describe('Packet Send', () => {
    it('should send valid packet and transition to QUEUED with lifecycle history', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const sendResult = packetEngine.sendPacket(createResult.value.id);
      expect(sendResult.ok).toBe(true);

      const packet = packetEngine.getPacket(createResult.value.id);
      expect(packet?.state).toBe('QUEUED');
      expect(packet?.lifecycleHistory).toHaveLength(1);
      expect(packet?.lifecycleHistory[0]).toMatchObject({
        from: 'CREATED',
        to: 'QUEUED',
        reason: 'send',
        ordinal: 1,
      });
    });

    it('should fail to send non-existent packet', () => {
      const invalidPacketId = 'invalid-packet-id' as PacketId;

      const result = packetEngine.sendPacket(invalidPacketId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENTITY_NOT_FOUND');
      }
    });

    it('should fail to send packet from terminal state', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.deliverPacket(createResult.value.id);

      const sendResult = packetEngine.sendPacket(createResult.value.id);
      expect(sendResult.ok).toBe(false);
      if (!sendResult.ok) {
        expect(sendResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
    });

    it('should fail to send if source device no longer exists', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      graph.removeDevice(pc1);

      const sendResult = packetEngine.sendPacket(createResult.value.id);
      expect(sendResult.ok).toBe(false);
      if (!sendResult.ok) {
        expect(sendResult.error.code).toBe('ENTITY_UNAVAILABLE');
      }
    });
  });

  // ── Packet Forward Tests ─────────────────────────────────────────────────────

  describe('Packet Forward', () => {
    it('should forward to connected neighbor successfully and state becomes FORWARDED', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);

      const forwardResult = packetEngine.forwardPacket(createResult.value.id, r1);
      expect(forwardResult.ok).toBe(true);

      const packet = packetEngine.getPacket(createResult.value.id);
      expect(packet?.state).toBe('FORWARDED');
      expect(packet?.currentLocation).toBe(r1);
      expect(packet?.history).toEqual([pc1, r1]);
    });

    it('first forward moves state QUEUED→FORWARDED; subsequent forwards keep FORWARDED', () => {
      const { pc1, r1, r2, server1 } = setupMultiHopNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      expect(packetEngine.getPacket(createResult.value.id)?.state).toBe('QUEUED');

      packetEngine.forwardPacket(createResult.value.id, r1);
      expect(packetEngine.getPacket(createResult.value.id)?.state).toBe('FORWARDED');

      packetEngine.forwardPacket(createResult.value.id, r2);
      expect(packetEngine.getPacket(createResult.value.id)?.state).toBe('FORWARDED');
    });

    it('should update current location on forward', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.forwardPacket(createResult.value.id, r1);

      const packet = packetEngine.getPacket(createResult.value.id);
      expect(packet?.currentLocation).toBe(r1);
    });

    it('should add to history on forward', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.forwardPacket(createResult.value.id, r1);

      const packet = packetEngine.getPacket(createResult.value.id);
      expect(packet?.history).toHaveLength(2);
      expect(packet?.history[0]).toBe(pc1);
      expect(packet?.history[1]).toBe(r1);
    });

    it('lifecycle history records each forward and the send transition', () => {
      const { pc1, r1, r2, server1 } = setupMultiHopNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.forwardPacket(createResult.value.id, r1);
      packetEngine.forwardPacket(createResult.value.id, r2);
      packetEngine.forwardPacket(createResult.value.id, server1);

      const p = packetEngine.getPacket(createResult.value.id);
      expect(p).toBeDefined();
      if (!p) return;

      expect(p.lifecycleHistory.map((e) => `${e.from}→${e.to}`)).toEqual([
        'CREATED→QUEUED',
        'QUEUED→FORWARDED',
        'FORWARDED→FORWARDED',
        'FORWARDED→FORWARDED',
      ]);
      expect(p.lifecycleHistory.map((e) => e.ordinal)).toEqual([1, 2, 3, 4]);
    });

    it('should fail to forward to unconnected device', () => {
      const { pc1, server1 } = setupSimpleNetwork();
      const isolatedDevice = graph.addPc('Isolated');

      expect(isolatedDevice.ok).toBe(true);
      if (!isolatedDevice.ok) return;

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);

      const forwardResult = packetEngine.forwardPacket(createResult.value.id, isolatedDevice.value);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('INVALID_ROUTE');
      }
    });

    it('should fail to forward from terminal state', () => {
      const { server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: server1,
        destinationDeviceId: server1,
        sourceIp: '10.0.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Local delivery',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.deliverPacket(createResult.value.id);

      const forwardResult = packetEngine.forwardPacket(createResult.value.id, server1);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
    });

    it('should fail to forward non-existent packet', () => {
      const { r1 } = setupSimpleNetwork();
      const invalidPacketId = 'invalid-packet-id' as PacketId;

      const result = packetEngine.forwardPacket(invalidPacketId, r1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENTITY_NOT_FOUND');
      }
    });

    it('should preserve packet ID through multi-hop forwarding', () => {
      const { pc1, r1, r2, server1 } = setupMultiHopNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const originalId = createResult.value.id;

      packetEngine.sendPacket(originalId);
      packetEngine.forwardPacket(originalId, r1);
      packetEngine.forwardPacket(originalId, r2);

      const packet = packetEngine.getPacket(originalId);
      expect(packet?.id).toBe(originalId);
      expect(packet?.history).toEqual([pc1, r1, r2]);
    });

    it('should fail to forward if current location no longer exists', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);

      graph.removeDevice(pc1);

      const forwardResult = packetEngine.forwardPacket(createResult.value.id, r1);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('ENTITY_UNAVAILABLE');
      }
    });

    it('should fail to forward if next hop no longer exists', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);

      graph.removeDevice(r1);

      const forwardResult = packetEngine.forwardPacket(createResult.value.id, r1);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('ENTITY_NOT_FOUND');
      }
    });

    it('should fail to forward if link is DOWN', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);

      const link = graph.getLinkBetween(pc1, r1);
      expect(link).toBeDefined();
      if (link) {
        graph.failLink(link.id);
      }

      const forwardResult = packetEngine.forwardPacket(createResult.value.id, r1);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('ENTITY_UNAVAILABLE');
      }
    });
  });

  // ── Packet Delivery Tests ───────────────────────────────────────────────────

  describe('Packet Delivery', () => {
    it('should deliver packet at destination successfully', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      // Local delivery case (source=destination, no forwarding needed)
      const manualDelivery = packetEngine.createPacket({
        sourceDeviceId: server1,
        destinationDeviceId: server1,
        sourceIp: '10.0.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Local delivery',
      });

      expect(manualDelivery.ok).toBe(true);
      if (!manualDelivery.ok) return;

      packetEngine.sendPacket(manualDelivery.value.id);

      const deliverResult = packetEngine.deliverPacket(manualDelivery.value.id);
      expect(deliverResult.ok).toBe(true);

      const packet = packetEngine.getPacket(manualDelivery.value.id);
      expect(packet?.state).toBe('DELIVERED');
    });

    it('QUEUED at destination transparently promotes to FORWARDED then DELIVERED', () => {
      const { server1 } = setupSimpleNetwork();
      const manualDelivery = packetEngine.createPacket({
        sourceDeviceId: server1,
        destinationDeviceId: server1,
        sourceIp: '10.0.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Local',
      });

      expect(manualDelivery.ok).toBe(true);
      if (!manualDelivery.ok) return;

      packetEngine.sendPacket(manualDelivery.value.id);
      expect(packetEngine.getPacket(manualDelivery.value.id)?.state).toBe('QUEUED');

      packetEngine.deliverPacket(manualDelivery.value.id);
      const p = packetEngine.getPacket(manualDelivery.value.id);
      expect(p?.state).toBe('DELIVERED');
      // lifecycle history: CREATED→QUEUED, QUEUED→FORWARDED (implicit promotion), FORWARDED→DELIVERED
      expect(p?.lifecycleHistory.map((e) => `${e.from}→${e.to}`)).toEqual([
        'CREATED→QUEUED',
        'QUEUED→FORWARDED',
        'FORWARDED→DELIVERED',
      ]);
    });

    it('should transition to DELIVERED state via full path', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.forwardPacket(createResult.value.id, r1);
      packetEngine.forwardPacket(createResult.value.id, server1);
      packetEngine.deliverPacket(createResult.value.id);

      const packet = packetEngine.getPacket(createResult.value.id);
      expect(packet?.state).toBe('DELIVERED');
    });

    it('should fail to deliver away from destination', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.forwardPacket(createResult.value.id, r1);

      // Try to deliver while at R1, not at Server1
      const deliverResult = packetEngine.deliverPacket(createResult.value.id);
      expect(deliverResult.ok).toBe(false);
      if (!deliverResult.ok) {
        expect(deliverResult.error.code).toBe('INVALID_ROUTE');
      }
    });

    it('should fail to deliver from terminal state', () => {
      const { server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: server1,
        destinationDeviceId: server1,
        sourceIp: '10.0.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Local delivery',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.deliverPacket(createResult.value.id);

      // Try to deliver again
      const deliverResult = packetEngine.deliverPacket(createResult.value.id);
      expect(deliverResult.ok).toBe(false);
      if (!deliverResult.ok) {
        expect(deliverResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
    });

    it('should fail to deliver non-existent packet', () => {
      const invalidPacketId = 'invalid-packet-id' as PacketId;

      const result = packetEngine.deliverPacket(invalidPacketId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENTITY_NOT_FOUND');
      }
    });
  });

  // ── Packet Drop Tests ───────────────────────────────────────────────────────

  describe('Packet Drop', () => {
    it('should drop QUEUED packet and transition to DROPPED with lifecycle history', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // State machine requires CREATED→QUEUED before QUEUED→DROPPED
      packetEngine.sendPacket(createResult.value.id);

      const dropResult = packetEngine.dropPacket(createResult.value.id, 'INVALID_ROUTE');
      expect(dropResult.ok).toBe(true);

      const packet = packetEngine.getPacket(createResult.value.id);
      expect(packet?.state).toBe('DROPPED');
      const last = packet?.lifecycleHistory[packet.lifecycleHistory.length - 1];
      expect(last).toMatchObject({
        from: 'QUEUED',
        to: 'DROPPED',
        reason: 'invalid_route',
      });
    });

    it('should drop FORWARDED packet (mid-route) successfully', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.forwardPacket(createResult.value.id, r1);

      const dropResult = packetEngine.dropPacket(createResult.value.id, 'UNREACHABLE');
      expect(dropResult.ok).toBe(true);
      expect(packetEngine.getPacket(createResult.value.id)?.state).toBe('DROPPED');
    });

    it('cannot drop a CREATED packet directly (must QUEUE first)', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Try to drop while still in CREATED state
      const dropResult = packetEngine.dropPacket(createResult.value.id, 'INVALID_ROUTE');
      expect(dropResult.ok).toBe(false);
      if (!dropResult.ok) {
        expect(dropResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
      // Original state preserved
      expect(packetEngine.getPacket(createResult.value.id)?.state).toBe('CREATED');
    });

    it('should preserve drop reason in emitted event', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      let capturedReason: string | undefined;
      eventBus.on('PACKET_DROPPED', (event) => {
        capturedReason = event.reason;
      });

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      const dropResult = packetEngine.dropPacket(createResult.value.id, 'UNREACHABLE');
      expect(dropResult.ok).toBe(true);
      expect(capturedReason).toBe('UNREACHABLE');
    });

    it('should fail to drop from terminal state (DELIVERED)', () => {
      const { server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: server1,
        destinationDeviceId: server1,
        sourceIp: '10.0.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Local delivery',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.deliverPacket(createResult.value.id);

      const dropResult = packetEngine.dropPacket(
        createResult.value.id,
        'INVALID_ROUTE' as PacketDropReason,
      );
      expect(dropResult.ok).toBe(false);
      if (!dropResult.ok) {
        expect(dropResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
    });

    it('should fail to drop non-existent packet', () => {
      const invalidPacketId = 'invalid-packet-id' as PacketId;

      const result = packetEngine.dropPacket(invalidPacketId, 'INVALID_ROUTE' as PacketDropReason);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENTITY_NOT_FOUND');
      }
    });

    it('dropped packet preserves id/source/dest/payload/location/history/drop reason', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'DROP_TEST',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;
      const id = createResult.value.id;

      packetEngine.sendPacket(id);
      packetEngine.forwardPacket(id, r1);
      packetEngine.dropPacket(id, 'NO_ROUTE_TO_HOST');

      const p = packetEngine.getPacket(id);
      expect(p).toBeDefined();
      if (!p) return;

      expect(p.id).toBe(id);
      expect(p.sourceDeviceId).toBe(pc1);
      expect(p.destinationDeviceId).toBe(server1);
      expect(p.sourceIp).toBe('192.168.1.10');
      expect(p.destinationIp).toBe('10.0.1.10');
      expect(p.payload).toBe('DROP_TEST');
      expect(p.currentLocation).toBe(r1);
      expect(p.history).toEqual([pc1, r1]);
      const last = p.lifecycleHistory[p.lifecycleHistory.length - 1];
      expect(last.to).toBe('DROPPED');
      expect(last.reason).toBe('no_route_to_host');
    });
  });

  // ── Terminal State Protection Tests ──────────────────────────────────────────

  describe('Terminal State Protection', () => {
    it('DELIVERED packet cannot be forwarded', () => {
      const { server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: server1,
        destinationDeviceId: server1,
        sourceIp: '10.0.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Local delivery',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.deliverPacket(createResult.value.id);

      const forwardResult = packetEngine.forwardPacket(createResult.value.id, server1);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
    });

    it('DELIVERED packet cannot be dropped', () => {
      const { server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: server1,
        destinationDeviceId: server1,
        sourceIp: '10.0.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Local delivery',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.deliverPacket(createResult.value.id);

      const dropResult = packetEngine.dropPacket(
        createResult.value.id,
        'INVALID_ROUTE' as PacketDropReason,
      );
      expect(dropResult.ok).toBe(false);
      if (!dropResult.ok) {
        expect(dropResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
    });

    it('DROPPED packet cannot be forwarded', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.dropPacket(createResult.value.id, 'INVALID_ROUTE');

      const forwardResult = packetEngine.forwardPacket(createResult.value.id, server1);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
    });

    it('DROPPED packet cannot be delivered', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);
      packetEngine.dropPacket(createResult.value.id, 'INVALID_ROUTE');

      const deliverResult = packetEngine.deliverPacket(createResult.value.id);
      expect(deliverResult.ok).toBe(false);
      if (!deliverResult.ok) {
        expect(deliverResult.error.code).toBe('SIMULATION_STATE_ERROR'); // terminal state check runs before location check
      }
    });
  });

  // ── Packet Identity Tests ────────────────────────────────────────────────────

  describe('Packet Identity', () => {
    it('packet ID remains constant through forwarding', () => {
      const { pc1, r1, r2, server1 } = setupMultiHopNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const originalId = createResult.value.id;

      packetEngine.sendPacket(originalId);
      packetEngine.forwardPacket(originalId, r1);
      packetEngine.forwardPacket(originalId, r2);

      const packet = packetEngine.getPacket(originalId);
      expect(packet?.id).toBe(originalId);
    });

    it('multiple packets have independent IDs', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const packet1 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Packet 1',
      });

      const packet2 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Packet 2',
      });

      const packet3 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Packet 3',
      });

      expect(packet1.ok && packet2.ok && packet3.ok).toBe(true);
      if (packet1.ok && packet2.ok && packet3.ok) {
        const ids = [packet1.value.id, packet2.value.id, packet3.value.id];
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(3);
      }
    });

    it('packet operations do not affect other packets — independence test', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const packet1 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Packet 1',
      });

      const packet2 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Packet 2',
      });

      expect(packet1.ok && packet2.ok).toBe(true);
      if (!packet1.ok || !packet2.ok) return;

      // Drop packet1: send first (to QUEUED) then drop
      packetEngine.sendPacket(packet1.value.id);
      packetEngine.dropPacket(packet1.value.id, 'INVALID_ROUTE');

      // Packet2 should still be in CREATED state, completely unaffected
      const p2 = packetEngine.getPacket(packet2.value.id);
      expect(p2?.state).toBe('CREATED');
      expect(p2?.lifecycleHistory).toHaveLength(0);
    });
  });

  // ── Topology Respect Tests ───────────────────────────────────────────────────

  describe('Topology Respect', () => {
    it('cannot teleport between unconnected devices', () => {
      const { pc1, server1 } = setupSimpleNetwork();
      const isolatedDevice = graph.addPc('Isolated');

      expect(isolatedDevice.ok).toBe(true);
      if (!isolatedDevice.ok) return;

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);

      // Try to teleport directly to isolated device
      const forwardResult = packetEngine.forwardPacket(createResult.value.id, isolatedDevice.value);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('INVALID_ROUTE');
      }
    });

    it('graph topology is authoritative', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);

      // Invalid forward skipping R1 (PC1 not directly connected to Server1)
      const invalidForward = packetEngine.forwardPacket(createResult.value.id, server1);
      expect(invalidForward.ok).toBe(false);

      // Valid forward through graph
      const validForward = packetEngine.forwardPacket(createResult.value.id, r1);
      expect(validForward.ok).toBe(true);
    });

    it('disconnected subgraphs remain isolated', () => {
      // A -- B    C -- D
      const a = graph.addPc('A');
      const b = graph.addRouter('B');
      const c = graph.addRouter('C');
      const d = graph.addPc('D');

      if (!a.ok || !b.ok || !c.ok || !d.ok) return;

      const aEth0 = Array.from(graph.getDevice(a.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;
      const bEth0 = graph.addInterface(b.value, 'eth0');
      const cEth0 = graph.addInterface(c.value, 'eth0');
      const dEth0 = Array.from(graph.getDevice(d.value)!.interfaces.values()).find(
        (i) => i.name === 'eth0',
      )!;

      if (!bEth0.ok || !cEth0.ok) return;

      graph.addLink(aEth0.id, bEth0.value);
      graph.addLink(cEth0.value, dEth0.id);

      const createResult = packetEngine.createPacket({
        sourceDeviceId: a.value,
        destinationDeviceId: d.value,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      packetEngine.sendPacket(createResult.value.id);

      // Cannot cross from A-B subgraph to C-D subgraph
      const forwardResult = packetEngine.forwardPacket(createResult.value.id, c.value);
      expect(forwardResult.ok).toBe(false);
      if (!forwardResult.ok) {
        expect(forwardResult.error.code).toBe('INVALID_ROUTE');
      }
    });
  });

  // ── Packet Registry Tests ────────────────────────────────────────────────────

  describe('Packet Registry', () => {
    it('getPacket returns correct packet', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const packet = packetEngine.getPacket(createResult.value.id);
      expect(packet).toBeDefined();
      expect(packet?.id).toBe(createResult.value.id);
    });

    it('hasPacket works correctly', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      expect(packetEngine.hasPacket(createResult.value.id)).toBe(true);
      expect(packetEngine.hasPacket('invalid-id' as PacketId)).toBe(false);
    });

    it('getActivePackets returns non-terminal packets (CREATED/QUEUED/FORWARDED)', () => {
      const { pc1, r1, server1 } = setupSimpleNetwork();

      const packet1 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Active 1',
      });

      const packet2 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Active 2',
      });

      expect(packet1.ok && packet2.ok).toBe(true);
      if (!packet1.ok || !packet2.ok) return;

      // Send one packet to QUEUED, forward another through to FORWARDED
      packetEngine.sendPacket(packet1.value.id);
      packetEngine.sendPacket(packet2.value.id);
      packetEngine.forwardPacket(packet2.value.id, r1);

      const activePackets = packetEngine.getActivePackets();
      expect(activePackets.length).toBe(2);
      const states = activePackets.map((p) => p.state);
      expect(states.sort()).toEqual(['FORWARDED', 'QUEUED'].sort());
    });

    it('getCompletedPackets returns terminal packets (DELIVERED / DROPPED)', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const packet1 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test 1',
      });

      const packet2 = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test 2',
      });

      expect(packet1.ok && packet2.ok).toBe(true);
      if (!packet1.ok || !packet2.ok) return;

      // Drop one (send then drop)
      packetEngine.sendPacket(packet1.value.id);
      packetEngine.dropPacket(packet1.value.id, 'INVALID_ROUTE');

      const completedPackets = packetEngine.getCompletedPackets();
      expect(completedPackets.length).toBe(1);
      expect(completedPackets[0].state).toBe('DROPPED');
    });
  });

  // ── Integration Tests ────────────────────────────────────────────────────────

  describe('Integration Tests', () => {
    it('full scenario: PC1 → R1 → R2 → Server1 with state machine validation', () => {
      const { pc1, r1, r2, server1 } = setupMultiHopNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Full path test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const packetId = createResult.value.id;

      // Step 1: Send → CREATED→QUEUED
      packetEngine.sendPacket(packetId);
      expect(packetEngine.getPacket(packetId)?.state).toBe('QUEUED');

      // Step 2: Forward PC1 → R1, QUEUED→FORWARDED
      packetEngine.forwardPacket(packetId, r1);
      expect(packetEngine.getPacket(packetId)?.state).toBe('FORWARDED');
      expect(packetEngine.getPacket(packetId)?.currentLocation).toBe(r1);
      expect(packetEngine.getPacket(packetId)?.history).toEqual([pc1, r1]);

      // Step 3: Forward R1 → R2, FORWARDED→FORWARDED
      packetEngine.forwardPacket(packetId, r2);
      expect(packetEngine.getPacket(packetId)?.state).toBe('FORWARDED');
      expect(packetEngine.getPacket(packetId)?.currentLocation).toBe(r2);
      expect(packetEngine.getPacket(packetId)?.history).toEqual([pc1, r1, r2]);

      // Step 4: Forward R2 → Server1, FORWARDED→FORWARDED
      packetEngine.forwardPacket(packetId, server1);
      expect(packetEngine.getPacket(packetId)?.state).toBe('FORWARDED');
      expect(packetEngine.getPacket(packetId)?.currentLocation).toBe(server1);
      expect(packetEngine.getPacket(packetId)?.history).toEqual([pc1, r1, r2, server1]);

      // Step 5: Deliver, FORWARDED→DELIVERED
      packetEngine.deliverPacket(packetId);
      expect(packetEngine.getPacket(packetId)?.state).toBe('DELIVERED');

      // Final lifecycle audit
      const finalLifecycle = packetEngine.getPacket(packetId)?.lifecycleHistory ?? [];
      expect(finalLifecycle.map((e) => `${e.from}→${e.to}`)).toEqual([
        'CREATED→QUEUED',
        'QUEUED→FORWARDED',
        'FORWARDED→FORWARDED',
        'FORWARDED→FORWARDED',
        'FORWARDED→DELIVERED',
      ]);
    });

    it('event emissions verification', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      const events: string[] = [];
      eventBus.onAll((event) => {
        events.push(event.type);
      });

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      expect(events).toContain('PACKET_CREATED');
    });

    it('location history across multiple hops is separated from lifecycle history', () => {
      const { pc1, r1, r2, server1 } = setupMultiHopNetwork();

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'History test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const packetId = createResult.value.id;

      packetEngine.sendPacket(packetId);
      packetEngine.forwardPacket(packetId, r1);
      packetEngine.forwardPacket(packetId, r2);
      packetEngine.forwardPacket(packetId, server1);
      packetEngine.deliverPacket(packetId);

      const packet = packetEngine.getPacket(packetId);
      // Location history: device hops only
      expect(packet?.history).toEqual([pc1, r1, r2, server1]);
      // Lifecycle history: state transitions only (separate concept)
      expect(packet?.lifecycleHistory.map((e) => e.to)).toEqual([
        'QUEUED',
        'FORWARDED',
        'FORWARDED',
        'FORWARDED',
        'DELIVERED',
      ]);
      expect(packet?.history.length).not.toBe(packet?.lifecycleHistory.length);
    });
  });
});
