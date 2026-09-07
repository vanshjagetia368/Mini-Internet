/**
 * @file simulator/src/routing/DynamicRoutingService.test.ts
 *
 * Comprehensive tests for the DynamicRoutingService (Prompt 13).
 *
 * COVERAGE:
 *   1. Initial table generation
 *   2. Multiple routers
 *   3. Link removal - stale routes disappear
 *   4. Link addition - new routes appear
 *   5. Node removal - routes through removed node disappear
 *   6. Alternative route - remaining path is used
 *   7. Unreachable destination - no entry
 *   8. Dijkstra cost preservation
 *   9. BFS preservation
 *   10. Interface resolution
 *   11. Multiple independent networks
 *   12. Determinism
 *   13. Event-driven recalculation
 *   14. Atomic updates
 *   15. Algorithm selection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BfsRouter } from './BfsRouter.js';
import { DijkstraRouter } from './DijkstraRouter.js';
import { DynamicRoutingService } from './DynamicRoutingService.js';
import { NetworkGraph } from '../network/NetworkGraph.js';
import { EventBus } from '../events/EventBus.js';
import { IdFactory } from '../types/ids.js';
import type { DeviceId, InterfaceId, LinkId } from '../types/ids.js';
import type { RoutingTable } from './RoutingTable.js';
import { SilentLogger } from '../core/logger.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createGraph(): NetworkGraph {
  return new NetworkGraph(IdFactory.network(), 'DynamicRoutingTest', new EventBus());
}

function getInterfaceId(graph: NetworkGraph, deviceId: DeviceId, name: string): InterfaceId {
  const device = graph.getDevice(deviceId);
  if (!device) throw new Error(`Device ${deviceId} not found`);
  const iface = Array.from(device.interfaces.values()).find((i) => i.name === name);
  if (!iface) throw new Error(`Interface ${name} not found on device ${deviceId}`);
  return iface.id;
}

function addInterfaces(graph: NetworkGraph, deviceId: DeviceId, names: string[]): void {
  for (const name of names) {
    try {
      getInterfaceId(graph, deviceId, name);
      continue;
    } catch {
      // fall through and create it
    }
    const result = graph.addInterface(deviceId, name);
    if (!result.ok) throw new Error(`addInterface ${name} failed: ${result.error.message}`);
  }
}

function connect(
  graph: NetworkGraph,
  deviceA: DeviceId,
  ifaceNameA: string,
  deviceB: DeviceId,
  ifaceNameB: string,
  cost?: number,
): LinkId {
  const result = graph.addLink(
    getInterfaceId(graph, deviceA, ifaceNameA),
    getInterfaceId(graph, deviceB, ifaceNameB),
    cost !== undefined ? { cost } : {},
  );
  if (!result.ok) {
    throw new Error(
      `addLink failed for ${deviceA}.${ifaceNameA}-${deviceB}.${ifaceNameB}: ${result.error.message}`,
    );
  }
  return result.value;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('DynamicRoutingService', () => {
  let graph: NetworkGraph;
  let eventBus: EventBus;
  let logger: SilentLogger;
  let bfsService: DynamicRoutingService;
  let dijkstraService: DynamicRoutingService;

  beforeEach(() => {
    graph = createGraph();
    eventBus = new EventBus();
    logger = new SilentLogger();
    bfsService = new DynamicRoutingService(graph, eventBus, new BfsRouter(), logger);
    dijkstraService = new DynamicRoutingService(graph, eventBus, new DijkstraRouter(), logger);
  });

  afterEach(() => {
    bfsService.shutdown();
    dijkstraService.shutdown();
    eventBus.clear();
  });

  // ── Test 1: Initial table generation ─────────────────────────────────────────

  it('Test 1: generates routing tables on initialization', () => {
    const r1 = graph.addRouter('R1');
    const pc1 = graph.addPc('PC1');
    if (!r1.ok || !pc1.ok) throw new Error('setup failed');

    addInterfaces(graph, r1.value, ['eth0']);
    connect(graph, r1.value, 'eth0', pc1.value, 'eth0');

    bfsService.initialize();

    const table = bfsService.getRoutingTable(r1.value);
    expect(table).toBeDefined();
    expect(table!.has(pc1.value)).toBe(true);
  });

  // ── Test 2: Multiple routers ────────────────────────────────────────────────

  it('Test 2: each router receives correct routing information', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const r3 = graph.addRouter('R3');
    const pc1 = graph.addPc('PC1');
    const pc2 = graph.addPc('PC2');
    if (!r1.ok || !r2.ok || !r3.ok || !pc1.ok || !pc2.ok) throw new Error('setup failed');

    // Topology: PC1—R1—R2—R3—PC2
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    addInterfaces(graph, r3.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth0', pc1.value, 'eth0');
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', r3.value, 'eth0');
    connect(graph, r3.value, 'eth1', pc2.value, 'eth0');

    bfsService.initialize();

    const tableR1 = bfsService.getRoutingTable(r1.value);
    const tableR2 = bfsService.getRoutingTable(r2.value);
    const tableR3 = bfsService.getRoutingTable(r3.value);

    expect(tableR1).toBeDefined();
    expect(tableR2).toBeDefined();
    expect(tableR3).toBeDefined();

    // R1 should have route to PC2 via R2
    const r1ToPc2 = tableR1!.lookup(pc2.value);
    expect(r1ToPc2).toBeDefined();
    expect(r1ToPc2!.nextHop).toBe(r2.value);

    // R2 should have route to PC1 via R1
    const r2ToPc1 = tableR2!.lookup(pc1.value);
    expect(r2ToPc1).toBeDefined();
    expect(r2ToPc1!.nextHop).toBe(r1.value);

    // R3 should have route to PC1 via R2
    const r3ToPc1 = tableR3!.lookup(pc1.value);
    expect(r3ToPc1).toBeDefined();
    expect(r3ToPc1!.nextHop).toBe(r2.value);
  });

  // ── Test 3: Link removal ─────────────────────────────────────────────────────

  it('Test 3: stale routes disappear when link is removed', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 — Server
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    const linkId = connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', server.value, 'eth0');

    bfsService.initialize();

    // Before removal: R1 should have route to Server
    const tableBefore = bfsService.getRoutingTable(r1.value);
    expect(tableBefore!.has(server.value)).toBe(true);

    // Remove the R1-R2 link
    graph.removeLink(linkId);

    // After removal: R1 should NOT have route to Server
    const tableAfter = bfsService.getRoutingTable(r1.value);
    expect(tableAfter!.has(server.value)).toBe(false);
  });

  // ── Test 4: Link addition ───────────────────────────────────────────────────

  it('Test 4: new routes appear when link is added', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 (Server not connected to R2 yet)
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');

    bfsService.initialize();

    // Before addition: R1 should NOT have route to Server
    const tableBefore = bfsService.getRoutingTable(r1.value);
    expect(tableBefore!.has(server.value)).toBe(false);

    // Add R2-Server link
    connect(graph, r2.value, 'eth1', server.value, 'eth0');

    // After addition: R1 should have route to Server
    const tableAfter = bfsService.getRoutingTable(r1.value);
    expect(tableAfter!.has(server.value)).toBe(true);
  });

  // ── Test 5: Node removal ───────────────────────────────────────────────────

  it('Test 5: routes through removed node disappear', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 — Server
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', server.value, 'eth0');

    bfsService.initialize();

    // Before removal: R1 should have route to Server
    const tableBefore = bfsService.getRoutingTable(r1.value);
    expect(tableBefore!.has(server.value)).toBe(true);

    // Remove R2
    graph.removeDevice(r2.value);

    // After removal: R1 should NOT have route to Server
    const tableAfter = bfsService.getRoutingTable(r1.value);
    expect(tableAfter!.has(server.value)).toBe(false);
  });

  // ── Test 6: Alternative route ───────────────────────────────────────────────

  it('Test 6: remaining path is used when preferred path is removed', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const r3 = graph.addRouter('R3');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !r3.ok || !server.ok) throw new Error('setup failed');

    // Diamond topology:
    //       R2
    //      /  \
    // R1 —      — Server
    //      \  /
    //       R3
    addInterfaces(graph, r1.value, ['eth0', 'eth1', 'eth2']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    addInterfaces(graph, r3.value, ['eth0', 'eth1']);
    addInterfaces(graph, server.value, ['eth0', 'eth1']);

    const linkR1R2 = connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    const linkR1R3 = connect(graph, r1.value, 'eth2', r3.value, 'eth0');
    const linkR2Server = connect(graph, r2.value, 'eth1', server.value, 'eth0');
    const linkR3Server = connect(graph, r3.value, 'eth1', server.value, 'eth1');

    bfsService.initialize();

    // Before removal: R1 should have route to Server (via R2 or R3)
    const tableBefore = bfsService.getRoutingTable(r1.value);
    expect(tableBefore!.has(server.value)).toBe(true);

    // Remove R2-Server link
    graph.removeLink(linkR2Server);

    // After removal: R1 should still have route to Server (via R3)
    const tableAfter = bfsService.getRoutingTable(r1.value);
    expect(tableAfter!.has(server.value)).toBe(true);

    const entry = tableAfter!.lookup(server.value);
    expect(entry).toBeDefined();
    // Next hop should be R3 (the remaining path)
    expect(entry!.nextHop).toBe(r3.value);
  });

  // ── Test 7: Unreachable destination ─────────────────────────────────────────

  it('Test 7: unreachable destinations have no entry', () => {
    const r1 = graph.addRouter('R1');
    const isolatedPC = graph.addPc('IsolatedPC');
    if (!r1.ok || !isolatedPC.ok) throw new Error('setup failed');

    bfsService.initialize();

    const table = bfsService.getRoutingTable(r1.value);
    expect(table).toBeDefined();
    expect(table!.has(isolatedPC.value)).toBe(false);
  });

  // ── Test 8: Dijkstra cost preservation ─────────────────────────────────────

  it('Test 8: Dijkstra costs are preserved correctly', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const r3 = graph.addRouter('R3');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !r3.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 — R3 — Server with weighted costs
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    addInterfaces(graph, r3.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0', 10); // cost 10
    connect(graph, r2.value, 'eth1', r3.value, 'eth0', 5); // cost 5
    connect(graph, r3.value, 'eth1', server.value, 'eth0', 3); // cost 3

    dijkstraService.initialize();

    const table = dijkstraService.getRoutingTable(r1.value);
    expect(table).toBeDefined();

    const entry = table!.lookup(server.value);
    expect(entry).toBeDefined();
    // Total cost should be 10 + 5 + 3 = 18
    expect(entry!.cost).toBe(18);
  });

  // ── Test 9: BFS preservation ──────────────────────────────────────────────

  it('Test 9: BFS routing still works correctly', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const r3 = graph.addRouter('R3');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !r3.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 — R3 — Server
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    addInterfaces(graph, r3.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', r3.value, 'eth0');
    connect(graph, r3.value, 'eth1', server.value, 'eth0');

    bfsService.initialize();

    const table = bfsService.getRoutingTable(r1.value);
    expect(table).toBeDefined();

    const entry = table!.lookup(server.value);
    expect(entry).toBeDefined();
    // BFS cost should be hop count = 3
    expect(entry!.cost).toBe(3);
  });

  // ── Test 10: Interface resolution ───────────────────────────────────────────

  it('Test 10: interface points to correct next hop', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 — Server
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', server.value, 'eth0');

    bfsService.initialize();

    const table = bfsService.getRoutingTable(r1.value);
    const entry = table!.lookup(server.value);
    expect(entry).toBeDefined();

    // Interface should belong to R1 and be on the R1-R2 link
    const r1Device = graph.getDevice(r1.value)!;
    expect(r1Device.interfaces.has(entry!.interfaceId)).toBe(true);

    const iface = r1Device.interfaces.get(entry!.interfaceId)!;
    const r1r2Link = graph.getLinkBetween(r1.value, r2.value);
    expect(iface.connectedLinkId).toBe(r1r2Link!.id);
  });

  // ── Test 11: Multiple independent networks ─────────────────────────────────

  it('Test 11: routing state from one network does not affect another', () => {
    // Network 1
    const graph1 = createGraph();
    const eventBus1 = new EventBus();
    const logger1 = new SilentLogger();
    const service1 = new DynamicRoutingService(graph1, eventBus1, new BfsRouter(), logger1);

    const r1_1 = graph1.addRouter('R1');
    const pc1_1 = graph1.addPc('PC1');
    if (!r1_1.ok || !pc1_1.ok) throw new Error('setup failed');

    addInterfaces(graph1, r1_1.value, ['eth0']);
    connect(graph1, r1_1.value, 'eth0', pc1_1.value, 'eth0');

    service1.initialize();

    // Network 2
    const graph2 = createGraph();
    const eventBus2 = new EventBus();
    const logger2 = new SilentLogger();
    const service2 = new DynamicRoutingService(graph2, eventBus2, new BfsRouter(), logger2);

    const r1_2 = graph2.addRouter('R1');
    const pc1_2 = graph2.addPc('PC1');
    if (!r1_2.ok || !pc1_2.ok) throw new Error('setup failed');

    addInterfaces(graph2, r1_2.value, ['eth0']);
    connect(graph2, r1_2.value, 'eth0', pc1_2.value, 'eth0');

    service2.initialize();

    // Both networks should have their own routing tables
    const table1 = service1.getRoutingTable(r1_1.value);
    const table2 = service2.getRoutingTable(r1_2.value);

    expect(table1).toBeDefined();
    expect(table2).toBeDefined();
    expect(table1!.has(pc1_1.value)).toBe(true);
    expect(table2!.has(pc1_2.value)).toBe(true);

    // Tables should be independent objects
    expect(table1).not.toBe(table2);

    service1.shutdown();
    service2.shutdown();
    eventBus1.clear();
    eventBus2.clear();
  });

  // ── Test 12: Determinism ───────────────────────────────────────────────────

  it('Test 12: repeated calculations produce identical results', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 — Server
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', server.value, 'eth0');

    bfsService.initialize();

    const table1 = bfsService.getRoutingTable(r1.value);
    const table2 = bfsService.getRoutingTable(r1.value);
    const table3 = bfsService.getRoutingTable(r1.value);

    // All tables should be identical
    expect(table1).toBeDefined();
    expect(table2).toBeDefined();
    expect(table3).toBeDefined();

    const entries1 = table1!.getAll();
    const entries2 = table2!.getAll();
    const entries3 = table3!.getAll();

    expect(entries1).toEqual(entries2);
    expect(entries2).toEqual(entries3);
  });

  // ── Test 13: Event-driven recalculation ─────────────────────────────────────

  it('Test 13: topology changes trigger recalculation', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 (Server not connected yet)
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');

    bfsService.initialize();

    // Initially, R1 should not have route to Server
    const tableBefore = bfsService.getRoutingTable(r1.value);
    expect(tableBefore!.has(server.value)).toBe(false);

    // Add R2-Server link (this triggers topology change event)
    connect(graph, r2.value, 'eth1', server.value, 'eth0');

    // After topology change, R1 should have route to Server
    const tableAfter = bfsService.getRoutingTable(r1.value);
    expect(tableAfter!.has(server.value)).toBe(true);
  });

  // ── Test 14: Atomic updates ────────────────────────────────────────────────

  it('Test 14: tables are updated atomically (no partial state)', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const r3 = graph.addRouter('R3');
    const pc1 = graph.addPc('PC1');
    const pc2 = graph.addPc('PC2');
    if (!r1.ok || !r2.ok || !r3.ok || !pc1.ok || !pc2.ok) throw new Error('setup failed');

    // Complex topology
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    addInterfaces(graph, r3.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth0', pc1.value, 'eth0');
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', r3.value, 'eth0');
    connect(graph, r3.value, 'eth1', pc2.value, 'eth0');

    bfsService.initialize();

    // Get table before topology change
    const tableBefore = bfsService.getRoutingTable(r1.value);
    const sizeBefore = tableBefore!.size;

    // Remove a link
    const linkId = graph.getLinkBetween(r2.value, r3.value);
    if (linkId) {
      graph.removeLink(linkId.id);
    }

    // Get table after topology change
    const tableAfter = bfsService.getRoutingTable(r1.value);
    const sizeAfter = tableAfter!.size;

    // Table should be complete (not partially updated)
    // R1 should no longer have route to PC2
    expect(tableAfter!.has(pc2.value)).toBe(false);
    // R1 should still have route to PC1
    expect(tableAfter!.has(pc1.value)).toBe(true);
    // Size should have decreased (PC2 route removed)
    expect(sizeAfter).toBeLessThan(sizeBefore);
  });

  // ── Test 15: Algorithm selection ───────────────────────────────────────────

  it('Test 15: algorithm selection is respected (BFS vs Dijkstra)', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const r3 = graph.addRouter('R3');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !r3.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 — R3 — Server with weighted costs
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    addInterfaces(graph, r3.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0', 10);
    connect(graph, r2.value, 'eth1', r3.value, 'eth0', 5);
    connect(graph, r3.value, 'eth1', server.value, 'eth0', 3);

    bfsService.initialize();
    dijkstraService.initialize();

    const bfsTable = bfsService.getRoutingTable(r1.value);
    const dijkstraTable = dijkstraService.getRoutingTable(r1.value);

    const bfsEntry = bfsTable!.lookup(server.value);
    const dijkstraEntry = dijkstraTable!.lookup(server.value);

    expect(bfsEntry).toBeDefined();
    expect(dijkstraEntry).toBeDefined();

    // BFS uses hop count (3 hops)
    expect(bfsEntry!.cost).toBe(3);
    // Dijkstra uses link costs (10 + 5 + 3 = 18)
    expect(dijkstraEntry!.cost).toBe(18);
  });

  // ── Test 16: Explicit recalculation ─────────────────────────────────────────

  it('Test 16: explicit recalculation works correctly', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server = graph.addServer('Server1');
    if (!r1.ok || !r2.ok || !server.ok) throw new Error('setup failed');

    // R1 — R2 (Server not connected yet)
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');

    bfsService.initialize();

    // Initially, R1 should not have route to Server
    const tableBefore = bfsService.getRoutingTable(r1.value);
    expect(tableBefore!.has(server.value)).toBe(false);

    // Add R2-Server link
    connect(graph, r2.value, 'eth1', server.value, 'eth0');

    // Explicitly trigger recalculation
    bfsService.recalculateRoutes();

    // After explicit recalculation, R1 should have route to Server
    const tableAfter = bfsService.getRoutingTable(r1.value);
    expect(tableAfter!.has(server.value)).toBe(true);
  });

  // ── Test 17: ROUTING_TABLES_UPDATED event ───────────────────────────────────

  it('Test 17: emits ROUTING_TABLES_UPDATED event on recalculation', () => {
    const r1 = graph.addRouter('R1');
    const pc1 = graph.addPc('PC1');
    if (!r1.ok || !pc1.ok) throw new Error('setup failed');

    addInterfaces(graph, r1.value, ['eth0']);
    connect(graph, r1.value, 'eth0', pc1.value, 'eth0');

    let eventEmitted = false;
    const unsubscribe = eventBus.on('ROUTING_TABLES_UPDATED', (event) => {
      eventEmitted = true;
      expect(event.type).toBe('ROUTING_TABLES_UPDATED');
      expect(event.routerCount).toBeGreaterThan(0);
    });

    bfsService.initialize();

    expect(eventEmitted).toBe(true);
    unsubscribe();
  });

  // ── Test 18: Has routing table ─────────────────────────────────────────────

  it('Test 18: hasRoutingTable returns correct status', () => {
    const r1 = graph.addRouter('R1');
    const pc1 = graph.addPc('PC1');
    if (!r1.ok || !pc1.ok) throw new Error('setup failed');

    addInterfaces(graph, r1.value, ['eth0']);
    connect(graph, r1.value, 'eth0', pc1.value, 'eth0');

    bfsService.initialize();

    expect(bfsService.hasRoutingTable(r1.value)).toBe(true);
    expect(bfsService.hasRoutingTable(pc1.value)).toBe(false);
  });

  // ── Test 19: Get routing state ─────────────────────────────────────────────

  it('Test 19: getRoutingState returns current state', () => {
    const r1 = graph.addRouter('R1');
    const pc1 = graph.addPc('PC1');
    if (!r1.ok || !pc1.ok) throw new Error('setup failed');

    addInterfaces(graph, r1.value, ['eth0']);
    connect(graph, r1.value, 'eth0', pc1.value, 'eth0');

    // Before initialization, state should be DIRTY
    expect(bfsService.getRoutingState()).toBe('DIRTY');

    bfsService.initialize();

    // After initialization, state should be VALID
    expect(bfsService.getRoutingState()).toBe('VALID');

    // Trigger topology change
    graph.addInterface(r1.value, 'eth1');

    // After topology change, state should be DIRTY
    expect(bfsService.getRoutingState()).toBe('DIRTY');

    // Query table (triggers recalculation)
    bfsService.getRoutingTable(r1.value);

    // After recalculation, state should be VALID
    expect(bfsService.getRoutingState()).toBe('VALID');
  });

  // ── Test 20: Get all routing tables ─────────────────────────────────────────

  it('Test 20: getAllRoutingTables returns all tables', () => {
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const pc1 = graph.addPc('PC1');
    if (!r1.ok || !r2.ok || !pc1.ok) throw new Error('setup failed');

    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0']);
    connect(graph, r1.value, 'eth0', pc1.value, 'eth0');
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');

    bfsService.initialize();

    const allTables = bfsService.getAllRoutingTables();

    expect(allTables.size).toBe(2); // R1 and R2
    expect(allTables.has(r1.value)).toBe(true);
    expect(allTables.has(r2.value)).toBe(true);
  });
});
