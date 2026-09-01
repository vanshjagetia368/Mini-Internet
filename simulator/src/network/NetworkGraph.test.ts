/**
 * @file simulator/src/network/NetworkGraph.test.ts
 *
 * Unit tests for NetworkGraph — the authoritative network state container.
 *
 * These tests run entirely in Node — no browser, no React, no Express.
 * This validates the core architectural rule: the simulator is independently testable.
 */

import { describe, it, expect } from 'vitest';
import { NetworkGraph } from './NetworkGraph.js';
import { EventBus } from '../events/EventBus.js';
import { IdFactory } from '../types/ids.js';
import type { SimulationEvent } from '../types/events.js';

function makeGraph(): { graph: NetworkGraph; bus: EventBus } {
  const bus = new EventBus();
  const graph = new NetworkGraph(IdFactory.network(), 'test-net', bus);
  return { graph, bus };
}

describe('NetworkGraph', () => {
  describe('addDevice', () => {
    it('adds a device and returns its ID', () => {
      const { graph } = makeGraph();
      const result = graph.addDevice('PC-1', 'PC');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value);
      expect(device).toBeDefined();
      expect(device?.name).toBe('PC-1');
      expect(device?.type).toBe('PC');
      expect(device?.status).toBe('UP');
    });

    it('creates a loopback interface automatically', () => {
      const { graph } = makeGraph();
      const result = graph.addDevice('Router-1', 'ROUTER');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const device = graph.getDevice(result.value);
      expect(device?.interfaces.size).toBe(1);
      const [lo] = device!.interfaces.values();
      expect(lo?.name).toBe('lo');
      expect(lo?.ipAddress).toBe('127.0.0.1');
    });

    it('emits DEVICE_CREATED event', () => {
      const { graph, bus } = makeGraph();
      const events: SimulationEvent[] = [];
      bus.onAll((e) => events.push(e));

      graph.addDevice('PC-1', 'PC');

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('DEVICE_CREATED');
    });
  });

  describe('removeDevice', () => {
    it('removes a device that exists', () => {
      const { graph } = makeGraph();
      const result = graph.addDevice('PC-1', 'PC');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const removeResult = graph.removeDevice(result.value);
      expect(removeResult.ok).toBe(true);
      expect(graph.getDevice(result.value)).toBeUndefined();
    });

    it('returns ENTITY_NOT_FOUND for unknown device', () => {
      const { graph } = makeGraph();
      // Cast a fake ID for testing error paths
      const fakeId = 'dev_fake_000' as ReturnType<typeof IdFactory.device>;
      const result = graph.removeDevice(fakeId);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    });
  });

  describe('addLink', () => {
    it('connects two interfaces and emits LINK_CREATED', () => {
      const { graph, bus } = makeGraph();
      const events: SimulationEvent[] = [];
      bus.onAll((e) => events.push(e));

      const devA = graph.addDevice('A', 'PC');
      const devB = graph.addDevice('B', 'PC');
      expect(devA.ok && devB.ok).toBe(true);
      if (!devA.ok || !devB.ok) return;

      // Add eth0 to each
      const ifaceA = graph.addInterface(devA.value, 'eth0');
      const ifaceB = graph.addInterface(devB.value, 'eth0');
      expect(ifaceA.ok && ifaceB.ok).toBe(true);
      if (!ifaceA.ok || !ifaceB.ok) return;

      const link = graph.addLink(ifaceA.value, ifaceB.value);
      expect(link.ok).toBe(true);

      const linkEvent = events.find((e) => e.type === 'LINK_CREATED');
      expect(linkEvent).toBeDefined();
    });

    it('fails if an interface is already connected', () => {
      const { graph } = makeGraph();
      const devA = graph.addDevice('A', 'PC');
      const devB = graph.addDevice('B', 'PC');
      const devC = graph.addDevice('C', 'PC');
      if (!devA.ok || !devB.ok || !devC.ok) return;

      const ifA = graph.addInterface(devA.value, 'eth0');
      const ifB = graph.addInterface(devB.value, 'eth0');
      const ifC = graph.addInterface(devC.value, 'eth0');
      if (!ifA.ok || !ifB.ok || !ifC.ok) return;

      graph.addLink(ifA.value, ifB.value);
      // Try to link the already-connected ifA again
      const result = graph.addLink(ifA.value, ifC.value);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INVALID_TOPOLOGY');
    });
  });

  describe('failDevice / recoverDevice', () => {
    it('changes device status to DOWN then UP', () => {
      const { graph } = makeGraph();
      const result = graph.addDevice('R1', 'ROUTER');
      if (!result.ok) return;

      graph.failDevice(result.value);
      expect(graph.getDevice(result.value)?.status).toBe('DOWN');

      graph.recoverDevice(result.value);
      expect(graph.getDevice(result.value)?.status).toBe('UP');
    });

    it('emits NODE_FAILED and NODE_RECOVERED events', () => {
      const { graph, bus } = makeGraph();
      const events: SimulationEvent[] = [];
      bus.onAll((e) => events.push(e));

      const result = graph.addDevice('R1', 'ROUTER');
      if (!result.ok) return;

      graph.failDevice(result.value);
      graph.recoverDevice(result.value);

      const types = events.map((e) => e.type);
      expect(types).toContain('NODE_FAILED');
      expect(types).toContain('NODE_RECOVERED');
    });
  });

  describe('snapshot', () => {
    it('returns a complete readonly snapshot of the network', () => {
      const { graph } = makeGraph();
      graph.addDevice('PC-1', 'PC');
      graph.addDevice('Router-1', 'ROUTER');

      const snapshot = graph.snapshot();
      expect(snapshot.devices.size).toBe(2);
    });
  });
});
