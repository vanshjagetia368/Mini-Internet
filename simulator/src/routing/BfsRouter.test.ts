/**
 * @file simulator/src/routing/BfsRouter.test.ts
 *
 * Unit + integration tests for the BFS routing algorithm (Prompt 10).
 *
 * COVERAGE:
 *   1.  source === destination (local delivery)
 *   2.  direct neighbor
 *   3.  three-hop route
 *   4.  branching graph (deterministic exploration without duplication)
 *   5.  multiple shortest paths (deterministic tie-break, min hop count)
 *   6.  cycles (termination + correct route)
 *   7.  disconnected graph (NO_PATH)
 *   8.  invalid source
 *   9.  invalid destination
 *   10. single-node graph
 *   11. path validity (every consecutive pair is a real graph connection)
 *   12. shortest-path property (longer branch exists, BFS still picks min hops)
 *   13. integration with the real NetworkGraph (PC1 → R1 → R2 → Server1)
 *   14. full diamond verification scenario (Prompt 37) + PC1 → PC1
 *   15. device self-loop handling
 *   16. no mutation of the underlying network
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BfsRouter } from './BfsRouter.js';
import { NetworkGraph } from '../network/NetworkGraph.js';
import { EventBus } from '../events/EventBus.js';
import type { DeviceId, InterfaceId, LinkId } from '../types/ids.js';
import type { Route } from './RoutingAlgorithm.js';

describe('BfsRouter', () => {
  let bfs: BfsRouter;

  beforeEach(() => {
    bfs = new BfsRouter();
  });

  // ── Test Helpers ──────────────────────────────────────────────────────────

  function createGraph(): NetworkGraph {
    return new NetworkGraph('net-bfs-test', 'BFS Test Network', new EventBus());
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
        continue; // Interface already exists (e.g., default eth0 on PCs/servers).
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
  ): LinkId {
    const result = graph.addLink(
      getInterfaceId(graph, deviceA, ifaceNameA),
      getInterfaceId(graph, deviceB, ifaceNameB),
    );
    if (!result.ok) {
      throw new Error(
        `addLink failed for ${deviceA}.${ifaceNameA}-${deviceB}.${ifaceNameB}: ${result.error.message}`,
      );
    }
    return result.value;
  }

  /** Convert a Route into an ordered device path [source, hop1, ..., dest]. */
  function routeToPath(route: Route): DeviceId[] {
    return [route.sourceDeviceId, ...route.hops.map((h) => h.deviceId)];
  }

  /** True iff the two devices share at least one direct link. */
  function areAdjacent(graph: NetworkGraph, a: DeviceId, b: DeviceId): boolean {
    const deviceA = graph.getDevice(a);
    const deviceB = graph.getDevice(b);
    if (!deviceA || !deviceB) return false;
    for (const iface of deviceA.interfaces.values()) {
      if (!iface.connectedLinkId) continue;
      const link = graph.getLink(iface.connectedLinkId);
      if (!link) continue;
      const remoteEndpoint = iface.id === link.endpointA ? link.endpointB : link.endpointA;
      if (deviceB.interfaces.has(remoteEndpoint)) return true;
    }
    return false;
  }

  /** Assert every consecutive pair in the path is a real graph connection. */
  function expectValidPath(graph: NetworkGraph, path: DeviceId[]): void {
    expect(path.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < path.length - 1; i++) {
      expect(areAdjacent(graph, path[i]!, path[i + 1]!)).toBe(true);
    }
  }

  /** Assert the path contains no repeated devices. */
  function expectUniquePath(path: DeviceId[]): void {
    expect(new Set(path).size).toBe(path.length);
  }

  // ── Test 1: Source equals destination (local delivery) ────────────────────

  it('returns a zero-hop route when source equals destination', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    const server = graph.addServer('Server1');
    if (!pc.ok || !server.ok) throw new Error('setup failed');
    connect(graph, pc.value, 'eth0', server.value, 'eth0');

    const result = bfs.computeRoute(graph.snapshot(), pc.value, pc.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sourceDeviceId).toBe(pc.value);
    expect(result.value.destinationDeviceId).toBe(pc.value);
    expect(routeToPath(result.value)).toEqual([pc.value]);
    expect(result.value.hops).toHaveLength(0);
    expect(result.value.totalCost).toBe(0);
  });

  // ── Test 2: Direct neighbor ────────────────────────────────────────────────

  it('finds a path between directly connected devices', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    const server = graph.addServer('Server1');
    if (!pc.ok || !server.ok) throw new Error('setup failed');
    const linkId = connect(graph, pc.value, 'eth0', server.value, 'eth0');

    const result = bfs.computeRoute(graph.snapshot(), pc.value, server.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(routeToPath(result.value)).toEqual([pc.value, server.value]);
    expect(result.value.hops).toHaveLength(1);
    expect(result.value.totalCost).toBe(1);
    expect(result.value.hops[0]?.viaLinkId).toBe(linkId);
  });

  // ── Test 3: Three-hop route ────────────────────────────────────────────────

  it('finds the correct three-hop route through two routers', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server = graph.addServer('Server1');
    if (!pc.ok || !r1.ok || !r2.ok || !server.ok) throw new Error('setup failed');
    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);

    const l1 = connect(graph, pc.value, 'eth0', r1.value, 'eth0');
    const l2 = connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    const l3 = connect(graph, r2.value, 'eth1', server.value, 'eth0');

    const result = bfs.computeRoute(graph.snapshot(), pc.value, server.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(routeToPath(result.value)).toEqual([pc.value, r1.value, r2.value, server.value]);
    expect(result.value.hops).toHaveLength(3);
    expect(result.value.totalCost).toBe(3);
    expect(result.value.hops.map((h) => h.viaLinkId)).toEqual([l1, l2, l3]);
  });

  // ── Test 4: Branching graph ────────────────────────────────────────────────
  //         B
  //        / \
  // A ─── C   D
  //        \ /
  //         E

  it('finds a valid shortest path in a branching graph without duplicating nodes', () => {
    const graph = createGraph();
    const a = graph.addPc('PC1'); // A
    const c = graph.addRouter('R1'); // C
    const b = graph.addRouter('R2'); // B
    const d = graph.addServer('Server1'); // D
    const e = graph.addRouter('R3'); // E
    if (!a.ok || !c.ok || !b.ok || !d.ok || !e.ok) throw new Error('setup failed');

    addInterfaces(graph, c.value, ['eth0', 'eth1', 'eth2', 'eth3']);
    addInterfaces(graph, b.value, ['eth0', 'eth1']);
    addInterfaces(graph, e.value, ['eth0', 'eth1']);
    addInterfaces(graph, d.value, ['eth0', 'eth1', 'eth2']);

    connect(graph, a.value, 'eth0', c.value, 'eth0'); // A-C
    connect(graph, c.value, 'eth1', b.value, 'eth0'); // C-B
    connect(graph, c.value, 'eth2', d.value, 'eth0'); // C-D
    connect(graph, c.value, 'eth3', e.value, 'eth0'); // C-E
    connect(graph, b.value, 'eth1', d.value, 'eth1'); // B-D
    connect(graph, e.value, 'eth1', d.value, 'eth2'); // E-D

    // A → D: shortest is A→C→D (2 hops). BFS explores C first, finds D there.
    const result = bfs.computeRoute(graph.snapshot(), a.value, d.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(routeToPath(result.value)).toEqual([a.value, c.value, d.value]);
    expect(result.value.totalCost).toBe(2);
    expectUniquePath(routeToPath(result.value));
    expectValidPath(graph, routeToPath(result.value));
  });
  // ── Test 5: Multiple shortest paths ─────────────────────────────────────────
  //      B
  //     / \
  // A ───   ─── D
  //     \ /
  //      C

  it('picks a minimum-hop path deterministically when several shortest paths exist', () => {
    const graph = createGraph();
    const a = graph.addPc('PC1'); // A
    const b = graph.addRouter('R2'); // B
    const c = graph.addRouter('R3'); // C
    const d = graph.addServer('Server1'); // D
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error('setup failed');

    addInterfaces(graph, a.value, ['eth1']); // PC already has eth0
    addInterfaces(graph, b.value, ['eth0', 'eth1']);
    addInterfaces(graph, c.value, ['eth0', 'eth1']);
    addInterfaces(graph, d.value, ['eth0', 'eth1']);

    connect(graph, a.value, 'eth0', b.value, 'eth0'); // A-B
    connect(graph, a.value, 'eth1', c.value, 'eth0'); // A-C
    connect(graph, b.value, 'eth1', d.value, 'eth0'); // B-D
    connect(graph, c.value, 'eth1', d.value, 'eth1'); // C-D

    // Both A→B→D and A→C→D are 2 hops. A's interfaces iterate eth0 before
    // eth1, so BFS deterministically explores B first and returns A→B→D.
    const result = bfs.computeRoute(graph.snapshot(), a.value, d.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const path = routeToPath(result.value);
    expect(path[0]).toBe(a.value); // source first
    expect(path[path.length - 1]).toBe(d.value); // destination last
    expect(result.value.totalCost).toBe(2); // minimum hop count
    expectValidPath(graph, path);
    expectUniquePath(path);
    // Exact deterministic tie-break (first interface order).
    expect(path).toEqual([a.value, b.value, d.value]);
  });

  // ── Test 6: Cycle handling ─────────────────────────────────────────────────
  // A ─ B
  // |   |
  // D ─ C

  it('terminates and returns a valid shortest path on graphs containing cycles', () => {
    const graph = createGraph();
    const a = graph.addPc('PC1'); // A
    const b = graph.addRouter('R2'); // B
    const c = graph.addRouter('R3'); // C
    const d = graph.addServer('Server1'); // D
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error('setup failed');

    addInterfaces(graph, a.value, ['eth1']);
    addInterfaces(graph, b.value, ['eth0', 'eth1']);
    addInterfaces(graph, c.value, ['eth0', 'eth1']);
    addInterfaces(graph, d.value, ['eth0', 'eth1']);

    connect(graph, a.value, 'eth0', b.value, 'eth0'); // A-B
    connect(graph, a.value, 'eth1', d.value, 'eth0'); // A-D
    connect(graph, b.value, 'eth1', c.value, 'eth0'); // B-C
    connect(graph, c.value, 'eth1', d.value, 'eth1'); // C-D

    // A → C across the cycle: shortest is A→B→C (2 hops).
    const result = bfs.computeRoute(graph.snapshot(), a.value, c.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const path = routeToPath(result.value);
    expect(path).toEqual([a.value, b.value, c.value]);
    expect(result.value.totalCost).toBe(2);
    expectValidPath(graph, path);
    expectUniquePath(path);

    // Reverse direction must also work (and terminate).
    const reverse = bfs.computeRoute(graph.snapshot(), d.value, b.value);
    expect(reverse.ok).toBe(true);
  });

  // ── Test 7: Disconnected graph ─────────────────────────────────────────────
  // A ─ B     X ─ Y

  it('reports NO_PATH for disconnected source and destination', () => {
    const graph = createGraph();
    const a = graph.addPc('PC1');
    const b = graph.addRouter('R1');
    const x = graph.addPc('PC2');
    const y = graph.addServer('Server2');
    if (!a.ok || !b.ok || !x.ok || !y.ok) throw new Error('setup failed');

    addInterfaces(graph, b.value, ['eth0']);
    connect(graph, a.value, 'eth0', b.value, 'eth0'); // island 1: A-B
    connect(graph, x.value, 'eth0', y.value, 'eth0'); // island 2: X-Y

    const result = bfs.computeRoute(graph.snapshot(), a.value, y.value);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NO_PATH');
    expect(result.error.context?.['sourceDeviceId']).toBe(a.value);
    expect(result.error.context?.['destinationDeviceId']).toBe(y.value);
  });

  // ── Test 8: Invalid source ─────────────────────────────────────────────────

  it('returns ENTITY_NOT_FOUND when the source device does not exist', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    if (!pc.ok) throw new Error('setup failed');

    const missing = 'dev_does_not_exist' as DeviceId;
    const result = bfs.computeRoute(graph.snapshot(), missing, pc.value);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    expect(result.error.context?.['role']).toBe('source');
    expect(result.error.message).toContain('Source device');
  });

  // ── Test 9: Invalid destination ────────────────────────────────────────────

  it('returns ENTITY_NOT_FOUND when the destination device does not exist', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    if (!pc.ok) throw new Error('setup failed');

    const missing = 'dev_does_not_exist' as DeviceId;
    const result = bfs.computeRoute(graph.snapshot(), pc.value, missing);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ENTITY_NOT_FOUND');
    expect(result.error.context?.['role']).toBe('destination');
    expect(result.error.message).toContain('Destination device');
  });
  // ── Test 10: Single-node graph ─────────────────────────────────────────────

  it('handles a single-node graph with local delivery', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    if (!pc.ok) throw new Error('setup failed');

    const result = bfs.computeRoute(graph.snapshot(), pc.value, pc.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(routeToPath(result.value)).toEqual([pc.value]);
    expect(result.value.totalCost).toBe(0);
  });

  // ── Test 11: Path validity ─────────────────────────────────────────────────

  it('returns a path where every consecutive pair is a real graph connection', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const r3 = graph.addRouter('R3');
    const server = graph.addServer('Server1');
    if (!pc.ok || !r1.ok || !r2.ok || !r3.ok || !server.ok) throw new Error('setup failed');

    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    addInterfaces(graph, r3.value, ['eth0', 'eth1']);

    connect(graph, pc.value, 'eth0', r1.value, 'eth0');
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', r3.value, 'eth0');
    connect(graph, r3.value, 'eth1', server.value, 'eth0');

    const result = bfs.computeRoute(graph.snapshot(), pc.value, server.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const path = routeToPath(result.value);
    expect(path).toEqual([pc.value, r1.value, r2.value, r3.value, server.value]);
    expect(result.value.totalCost).toBe(4);
    expectValidPath(graph, path); // every consecutive pair is a real edge
    expectUniquePath(path);
  });

  // ── Test 12: Shortest-path property ────────────────────────────────────────
  // S ─ X ─ Y ─ T   (3 hops)
  // S ─ Z ─ T       (2 hops)

  it('returns the minimum-hop path even when a longer branch is explored first', () => {
    const graph = createGraph();
    const s = graph.addPc('PC1'); // S
    const x = graph.addRouter('R2'); // X
    const y = graph.addRouter('R3'); // Y
    const t = graph.addServer('Server1'); // T
    const z = graph.addRouter('R1'); // Z
    if (!s.ok || !x.ok || !y.ok || !t.ok || !z.ok) throw new Error('setup failed');

    addInterfaces(graph, s.value, ['eth1']); // PC has eth0 already
    addInterfaces(graph, x.value, ['eth0', 'eth1']);
    addInterfaces(graph, y.value, ['eth0', 'eth1']);
    addInterfaces(graph, t.value, ['eth0', 'eth1']);
    addInterfaces(graph, z.value, ['eth0', 'eth1']);

    connect(graph, s.value, 'eth0', x.value, 'eth0'); // S-X
    connect(graph, x.value, 'eth1', y.value, 'eth0'); // X-Y
    connect(graph, y.value, 'eth1', t.value, 'eth0'); // Y-T
    connect(graph, s.value, 'eth1', z.value, 'eth0'); // S-Z
    connect(graph, z.value, 'eth1', t.value, 'eth1'); // Z-T

    // S's eth0 neighbor (X) is explored first — the 3-hop path S-X-Y-T is
    // discovered before reaching Z. BFS must still return the 2-hop S-Z-T.
    const result = bfs.computeRoute(graph.snapshot(), s.value, t.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(routeToPath(result.value)).toEqual([s.value, z.value, t.value]);
    expect(result.value.totalCost).toBe(2);
    expectValidPath(graph, routeToPath(result.value));

    // Repeat call proves determinism / purity.
    const second = bfs.computeRoute(graph.snapshot(), s.value, t.value);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual(result.value);
  });

  // ── Test 13: Integration with the real NetworkGraph ────────────────────────
  // PC1 ─ R1 ─ R2 ─ Server1

  it('integrates with the actual network graph topology', () => {
    const graph = createGraph();
    const pc1 = graph.addPc('PC1');
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const server1 = graph.addServer('Server1');
    if (!pc1.ok || !r1.ok || !r2.ok || !server1.ok) throw new Error('setup failed');

    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    connect(graph, pc1.value, 'eth0', r1.value, 'eth0');
    connect(graph, r1.value, 'eth1', r2.value, 'eth0');
    connect(graph, r2.value, 'eth1', server1.value, 'eth0');

    const result = bfs.computeRoute(graph.snapshot(), pc1.value, server1.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const path = routeToPath(result.value);
    expect(path).toEqual([pc1.value, r1.value, r2.value, server1.value]);
    expect(result.value.totalCost).toBe(3);
    expect(result.value.sourceDeviceId).toBe(pc1.value);
    expect(result.value.destinationDeviceId).toBe(server1.value);
  });
  // ── Test 14: Full diamond verification scenario (Prompt 37) ─────────────────
  //             R2
  //            /  \
  //           /    \
  // PC1 ───── R1     R4 ───── Server1
  //           \    /
  //            \  /
  //             R3

  it('verifies the full diamond scenario (PC1 → Server1 and PC1 → PC1)', () => {
    const graph = createGraph();
    const pc1 = graph.addPc('PC1');
    const r1 = graph.addRouter('R1');
    const r2 = graph.addRouter('R2');
    const r3 = graph.addRouter('R3');
    const r4 = graph.addRouter('R4');
    const server1 = graph.addServer('Server1');
    if (!pc1.ok || !r1.ok || !r2.ok || !r3.ok || !r4.ok || !server1.ok) {
      throw new Error('setup failed');
    }

    addInterfaces(graph, r1.value, ['eth0', 'eth1', 'eth2']);
    addInterfaces(graph, r2.value, ['eth0', 'eth1']);
    addInterfaces(graph, r3.value, ['eth0', 'eth1']);
    addInterfaces(graph, r4.value, ['eth0', 'eth1', 'eth2']);

    connect(graph, pc1.value, 'eth0', r1.value, 'eth0'); // PC1-R1
    connect(graph, r1.value, 'eth1', r2.value, 'eth0'); // R1-R2
    connect(graph, r1.value, 'eth2', r3.value, 'eth0'); // R1-R3
    connect(graph, r2.value, 'eth1', r4.value, 'eth0'); // R2-R4
    connect(graph, r3.value, 'eth1', r4.value, 'eth1'); // R3-R4
    connect(graph, r4.value, 'eth2', server1.value, 'eth0'); // R4-Server1

    const result = bfs.computeRoute(graph.snapshot(), pc1.value, server1.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const path = routeToPath(result.value);
    expect(path[0]).toBe(pc1.value); // starts at PC1
    expect(path[path.length - 1]).toBe(server1.value); // reaches Server1
    expect(result.value.totalCost).toBe(4); // shortest-hop count
    expect(path).toEqual([pc1.value, r1.value, r2.value, r4.value, server1.value]);
    expectUniquePath(path); // no repeated nodes
    expectValidPath(graph, path); // every consecutive pair is connected

    // PC1 → PC1: valid local delivery, [PC1], 0 hops.
    const local = bfs.computeRoute(graph.snapshot(), pc1.value, pc1.value);
    expect(local.ok).toBe(true);
    if (!local.ok) return;
    expect(routeToPath(local.value)).toEqual([pc1.value]);
    expect(local.value.totalCost).toBe(0);
  });

  // ── Test 15: Device self-loop handling ─────────────────────────────────────

  it('handles device-level self-loops without getting stuck', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    const server = graph.addServer('Server1');
    if (!pc.ok || !server.ok) throw new Error('setup failed');

    // PC1: eth0/eth1 form a self-loop link; eth2 goes to Server1.
    addInterfaces(graph, pc.value, ['eth1', 'eth2']);
    const selfLink = connect(graph, pc.value, 'eth0', pc.value, 'eth1'); // A ─ A self-loop
    const externalLink = connect(graph, pc.value, 'eth2', server.value, 'eth0');

    const result = bfs.computeRoute(graph.snapshot(), pc.value, server.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const path = routeToPath(result.value);
    expect(path).toEqual([pc.value, server.value]);
    expect(result.value.totalCost).toBe(1);
    expect(result.value.hops[0]?.viaLinkId).toBe(externalLink);
    expectUniquePath(path);

    // The self-loop must not affect local delivery.
    const local = bfs.computeRoute(graph.snapshot(), pc.value, pc.value);
    expect(local.ok).toBe(true);
    if (!local.ok) return;
    expect(routeToPath(local.value)).toEqual([pc.value]);
    expect(local.value.totalCost).toBe(0);

    // Sanity: the self-loop link really exists in the graph.
    expect(graph.getLink(selfLink)).toBeDefined();
  });

  // ── Test 16: No network mutation ───────────────────────────────────────────

  it('does not modify the underlying network topology', () => {
    const graph = createGraph();
    const pc = graph.addPc('PC1');
    const r1 = graph.addRouter('R1');
    const server = graph.addServer('Server1');
    if (!pc.ok || !r1.ok || !server.ok) throw new Error('setup failed');

    addInterfaces(graph, r1.value, ['eth0', 'eth1']);
    connect(graph, pc.value, 'eth0', r1.value, 'eth0');
    connect(graph, r1.value, 'eth1', server.value, 'eth0');

    const before = graph.snapshot();
    const deviceIds = new Set(before.devices.keys());
    const linkIds = new Set(before.links.keys());

    const result = bfs.computeRoute(before, pc.value, server.value);
    expect(result.ok).toBe(true);

    const after = graph.snapshot();
    expect(new Set(after.devices.keys())).toEqual(deviceIds);
    expect(new Set(after.links.keys())).toEqual(linkIds);

    // Graph connectivity is unchanged (re-running still works).
    const again = bfs.computeRoute(after, pc.value, server.value);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(routeToPath(again.value)).toEqual([pc.value, r1.value, server.value]);
  });

  // ── Test 17: Algorithm naming ──────────────────────────────────────────────

  it('exposes the BFS algorithm name', () => {
    expect(bfs.name).toBe('BFS');
  });
});
