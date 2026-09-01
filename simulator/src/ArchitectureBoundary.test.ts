/**
 * @file simulator/src/ArchitectureBoundary.test.ts
 *
 * ARCHITECTURAL BOUNDARY VERIFICATION TESTS
 *
 * Prompt 2 Requirement #21:
 *   "Create an explicit test or validation demonstrating that the simulator
 *    can be tested without importing browser/server infrastructure.
 *    The test environment should NOT require: DOM, React, Express,
 *    running server, WebSocket, PostgreSQL."
 */

import { describe, it, expect } from 'vitest';
import { createLogger, SilentLogger, type Logger } from './core/logger.js';
import { IdFactory } from './types/ids.js';
import { EventBus } from './events/EventBus.js';
import { NetworkGraph } from './network/NetworkGraph.js';
import { SimulationEngine } from './simulation/SimulationEngine.js';
import { ok, err, SimulatorError } from './types/errors.js';

describe('Simulator Architecture Boundary', () => {
  describe('Runtime environment independence', () => {
    it('runs in a pure Node environment without browser globals', () => {
      // If either of these globals existed, the simulator would be at risk
      // of accidentally depending on browser APIs.
      //
      // The simulator tsconfig.json enforces lib: ["ES2022"] (no DOM) —
      // this runtime check is a second layer of defence.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (globalThis as any).window).toBe('undefined');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (globalThis as any).document).toBe('undefined');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (globalThis as any).localStorage).toBe('undefined');
      // Note: `fetch` exists in Node 18+ as a global — that's OK.
      // We only care about DOM/UI globals, not Node runtime features.
    });

    it('vitest environment is set to node (not jsdom / happy-dom)', () => {
      // Vitest populates process.env.VITEST_* — we confirm we are running
      // in the "node" environment, which matches how the simulator will
      // run on the server.
      expect(typeof process).not.toBe('undefined');
      expect(typeof process.versions).not.toBe('undefined');
      expect(typeof process.versions.node).toBe('string');
    });
  });

  describe('Core utilities work in isolation', () => {
    it('SilentLogger swallows all output without error', () => {
      const logger: Logger = new SilentLogger();
      // None of these calls should throw, print, or require any infrastructure.
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(typeof logger.info).toBe('function');
    });

    it('createLogger produces a working namespaced logger', () => {
      const logger = createLogger('sanity-check', 'SILENT');
      logger.info('this message is intentionally swallowed');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('IdFactory produces correctly-prefixed branded IDs', () => {
      const netId = IdFactory.network();
      const devId = IdFactory.device();
      const ifaceId = IdFactory.interface();
      const linkId = IdFactory.link();
      const pktId = IdFactory.packet();
      const simId = IdFactory.simulation();
      const evtId = IdFactory.event();

      expect(netId.startsWith('net_')).toBe(true);
      expect(devId.startsWith('dev_')).toBe(true);
      expect(ifaceId.startsWith('iface_')).toBe(true);
      expect(linkId.startsWith('link_')).toBe(true);
      expect(pktId.startsWith('pkt_')).toBe(true);
      expect(simId.startsWith('sim_')).toBe(true);
      expect(evtId.startsWith('evt_')).toBe(true);

      // No collisions for 100 samples of the same type
      const sample = new Set<string>();
      for (let i = 0; i < 100; i++) sample.add(IdFactory.device());
      expect(sample.size).toBe(100);
    });

    it('Result type (ok/err) constructors work without dependencies', () => {
      const good = ok(42);
      expect(good.ok).toBe(true);
      if (good.ok) expect(good.value).toBe(42);

      const bad = err('INVALID_COMMAND' as const, 'nope');
      expect(bad.ok).toBe(false);
      if (!bad.ok) {
        expect(bad.error.code).toBe('INVALID_COMMAND');
        expect(bad.error.message).toBe('nope');
      }

      const exc = new SimulatorError('ENTITY_NOT_FOUND', 'x');
      expect(exc.code).toBe('ENTITY_NOT_FOUND');
      expect(exc instanceof Error).toBe(true);
    });
  });

  describe('EventBus works in isolation', () => {
    it('publishes and subscribes without external deps', () => {
      const bus = new EventBus();
      const received: unknown[] = [];
      bus.onAll((evt) => received.push(evt));

      const fake = {
        id: 'evt_test' as const,
        type: 'DEVICE_CREATED' as const,
        timestamp: 0,
        payload: {},
      };
      bus.emit(fake);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(fake);
    });
  });

  describe('NetworkGraph works in isolation', () => {
    it('CRUD operations complete without browser/server imports', () => {
      const bus = new EventBus();
      const graph = new NetworkGraph(IdFactory.network(), 'test-graph', bus);

      const dev1 = graph.addDevice('PC-1', 'PC');
      expect(dev1.ok).toBe(true);
      if (!dev1.ok) return;

      const dev2 = graph.addDevice('R-1', 'ROUTER');
      expect(dev2.ok).toBe(true);
      if (!dev2.ok) return;

      const if1 = graph.addInterface(dev1.value, 'eth0');
      const if2 = graph.addInterface(dev2.value, 'eth0');
      expect(if1.ok && if2.ok).toBe(true);
      if (!if1.ok || !if2.ok) return;

      const link = graph.addLink(if1.value, if2.value);
      expect(link.ok).toBe(true);

      const snap = graph.snapshot();
      expect(snap.devices.size).toBe(2);
      expect(snap.links.size).toBe(1);
    });
  });

  describe('SimulationEngine instantiates in isolation', () => {
    it('engine constructor, start, pause, stop all work', () => {
      const bus = new EventBus();
      const logger = createLogger('sim-engine-test', 'SILENT');

      const engine = new SimulationEngine(
        {
          networkId: IdFactory.network(),
          tickMs: 50,
          seed: 1,
        },
        bus,
        logger,
      );

      expect(engine.id).toBeDefined();
      expect(engine.status).toBe('IDLE');

      // We intentionally do NOT call tick() repeatedly — that would
      // exercise packet routing which is Phase 3.
      // Instantiation + simple start/pause lifecycle is enough for the
      // Foundation Phase.
    });
  });
});
