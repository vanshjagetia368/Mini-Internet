import { describe, it, expect, beforeEach } from 'vitest';
import { PacketEngine } from './PacketEngine.js';
import { NetworkGraph } from '../network/NetworkGraph.js';
import { EventBus } from '../events/EventBus.js';
import type { DeviceId, PacketId } from '../types/ids.js';
import type { PacketState, PacketDropReason } from './Packet.js';

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
    // PC1 --- R1 --- Server1
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
    // PC1 --- R1 --- R2 --- Server1
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
    it('should send valid packet and transition to IN_TRANSIT', () => {
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
      expect(packet?.state).toBe('IN_TRANSIT');
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

      // Send and deliver
      packetEngine.sendPacket(createResult.value.id);
      packetEngine.deliverPacket(createResult.value.id);

      // Try to send again
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

      // Remove source device
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
    it('should forward to connected neighbor successfully', () => {
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
      expect(packet?.currentLocation).toBe(r1);
      expect(packet?.history).toEqual([pc1, r1]);
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

      // Remove current location
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

      // Remove next hop
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

      // Fail the link
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

      const createResult = packetEngine.createPacket({
        sourceDeviceId: pc1,
        destinationDeviceId: server1,
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.1.10',
        payload: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // For local delivery, we need to move packet to destination first
      // In this case, we'll test direct delivery at destination
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

    it('should transition to DELIVERED state', () => {
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
    it('should drop packet and transition to DROPPED', () => {
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

      const dropResult = packetEngine.dropPacket(createResult.value.id, 'INVALID_ROUTE');
      expect(dropResult.ok).toBe(true);

      const packet = packetEngine.getPacket(createResult.value.id);
      expect(packet?.state).toBe('DROPPED');
    });

    it('should preserve drop reason', () => {
      const { pc1, server1 } = setupSimpleNetwork();

      // Check that the event was emitted with the reason
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

      const dropResult = packetEngine.dropPacket(createResult.value.id, 'UNREACHABLE');
      expect(dropResult.ok).toBe(true);
      expect(capturedReason).toBe('UNREACHABLE');
    });

    it('should fail to drop from terminal state', () => {
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

      const dropResult = packetEngine.dropPacket(createResult.value.id, 'INVALID_ROUTE');
      expect(dropResult.ok).toBe(false);
      if (!dropResult.ok) {
        expect(dropResult.error.code).toBe('SIMULATION_STATE_ERROR');
      }
    });

    it('should fail to drop non-existent packet', () => {
      const invalidPacketId = 'invalid-packet-id' as PacketId;

      const result = packetEngine.dropPacket(invalidPacketId, 'INVALID_ROUTE');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENTITY_NOT_FOUND');
      }
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

      const dropResult = packetEngine.dropPacket(createResult.value.id, 'INVALID_ROUTE');
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

      packetEngine.dropPacket(createResult.value.id, 'INVALID_ROUTE');

      const deliverResult = packetEngine.deliverPacket(createResult.value.id);
      expect(deliverResult.ok).toBe(false);
      if (!deliverResult.ok) {
        expect(deliverResult.error.code).toBe('SIMULATION_STATE_ERROR');
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

    it('packet operations do not affect other packets', () => {
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

      // Drop packet1
      packetEngine.dropPacket(packet1.value.id, 'INVALID_ROUTE');

      // Packet2 should still be in CREATED state
      const packet2State = packetEngine.getPacket(packet2.value.id)?.state;
      expect(packet2State).toBe('CREATED');
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

    it('getActivePackets returns non-terminal packets', () => {
      const { pc1, server1 } = setupSimpleNetwork();

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

      // Send one packet to make it IN_TRANSIT
      packetEngine.sendPacket(packet1.value.id);

      const activePackets = packetEngine.getActivePackets();
      expect(activePackets.length).toBe(2);
      expect(activePackets.every((p) => p.state === 'CREATED' || p.state === 'IN_TRANSIT')).toBe(true);
    });

    it('getCompletedPackets returns terminal packets', () => {
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

      // Drop one packet
      packetEngine.dropPacket(packet1.value.id, 'INVALID_ROUTE');

      const completedPackets = packetEngine.getCompletedPackets();
      expect(completedPackets.length).toBe(1);
      expect(completedPackets[0].state).toBe('DROPPED');
    });
  });

  // ── Integration Tests ────────────────────────────────────────────────────────

  describe('Integration Tests', () => {
    it('full scenario: PC1 → R1 → R2 → Server1', () => {
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

      // Send
      packetEngine.sendPacket(packetId);
      expect(packetEngine.getPacket(packetId)?.state).toBe('IN_TRANSIT');

      // Forward PC1 → R1
      packetEngine.forwardPacket(packetId, r1);
      expect(packetEngine.getPacket(packetId)?.currentLocation).toBe(r1);
      expect(packetEngine.getPacket(packetId)?.history).toEqual([pc1, r1]);

      // Forward R1 → R2
      packetEngine.forwardPacket(packetId, r2);
      expect(packetEngine.getPacket(packetId)?.currentLocation).toBe(r2);
      expect(packetEngine.getPacket(packetId)?.history).toEqual([pc1, r1, r2]);

      // Forward R2 → Server1
      packetEngine.forwardPacket(packetId, server1);
      expect(packetEngine.getPacket(packetId)?.currentLocation).toBe(server1);
      expect(packetEngine.getPacket(packetId)?.history).toEqual([pc1, r1, r2, server1]);

      // Deliver
      packetEngine.deliverPacket(packetId);
      expect(packetEngine.getPacket(packetId)?.state).toBe('DELIVERED');
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

    it('history tracking across multiple hops', () => {
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

      const packet = packetEngine.getPacket(packetId);
      expect(packet?.history).toEqual([pc1, r1, r2, server1]);
    });
  });
});
