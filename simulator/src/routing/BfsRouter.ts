/**
 * @file simulator/src/routing/BfsRouter.ts
 *
 * BFS (Breadth-First Search) routing algorithm implementation.
 *
 * BFS finds the path with the minimum number of hops (edges) between two
 * devices in the network topology. Every edge is treated equally — no
 * weights, costs, or metrics are considered.
 *
 * This is the FIRST routing algorithm implemented (Prompt 10). Dijkstra
 * (Prompt 11) will later introduce weighted edge costs.
 *
 * COMPLEXITY:
 *   Time:  O(V + E) — V = devices (vertices), E = links (edges)
 *   Space: O(V)     — visited set + parent map + queue
 *
 * ARCHITECTURE:
 *   - Implements the RoutingAlgorithm interface.
 *   - Operates on a read-only Network snapshot — it NEVER mutates topology.
 *   - Does NOT maintain a second adjacency representation. Device neighbors
 *     are resolved on demand from the existing graph topology (devices,
 *     interfaces, links), using a transient InterfaceId → DeviceId index
 *     that is rebuilt from the snapshot for each call.
 *   - Reuses the existing Route / RouteHop domain models.
 *   - Pure function: identical (network, source, destination) inputs always
 *     produce identical output. Neighbor ordering follows the network's
 *     natural interface insertion order, so tie-breaking is deterministic.
 */

import type { DeviceId, InterfaceId, LinkId } from '../types/ids.js';
import type { Network } from '../types/domain.js';
import type { Result } from '../types/errors.js';
import { err, ok } from '../types/errors.js';
import type { RoutingAlgorithm, Route, RouteHop } from './RoutingAlgorithm.js';

// ─── Internal Types ─────────────────────────────────────────────────────────

/**
 * A device-level neighbor discovered while exploring the graph.
 * `linkId` is the exact Link used to reach the neighbor.
 */
interface Neighbor {
  readonly deviceId: DeviceId;
  readonly linkId: LinkId;
}

/**
 * Predecessor information recorded during BFS.
 * `via` is the device from which `deviceId` was first discovered;
 * `linkId` is the link used to make that hop.
 */
interface ParentEntry {
  readonly via: DeviceId;
  readonly linkId: LinkId;
}

// ─── BfsRouter ───────────────────────────────────────────────────────────────

/**
 * BFS-based routing algorithm.
 *
 * Finds the minimum-hop path between two devices by exploring the network
 * graph level by level. Every edge has equal cost.
 *
 * Usage:
 *   const bfs = new BfsRouter();
 *   const result = bfs.computeRoute(network, sourceId, destinationId);
 *   if (result.ok) { ... }
 */
export class BfsRouter implements RoutingAlgorithm {
  readonly name = 'BFS';

  /**
   * Compute the shortest-hop path from source to destination.
   *
   * Algorithm steps:
   *   1. Validate the source device exists.
   *   2. Validate the destination device exists.
   *   3. If source === destination, return a zero-hop route (local delivery).
   *   4. Rebuild a transient InterfaceId → DeviceId index from the snapshot.
   *   5. Initialize the BFS queue (index-based, O(1) dequeue).
   *   6. Track visited devices (Set) to prevent infinite traversal / cycles.
   *   7. Track parent/predecessor info during traversal for reconstruction.
   *   8. On reaching the destination, reconstruct the ordered path.
   *   9. If the queue exhausts, the destination is unreachable → NO_PATH.
   *
   * Pure: does NOT modify the network object. Deterministic for the same
   * (network, source, destination) inputs.
   */
  computeRoute(network: Network, sourceId: DeviceId, destinationId: DeviceId): Result<Route> {
    // ── 1. Validate source ─────────────────────────────────────────────────
    if (!network.devices.has(sourceId)) {
      return err('ENTITY_NOT_FOUND', `Source device ${sourceId} not found in network`, {
        role: 'source',
        deviceId: sourceId,
      });
    }

    // ── 2. Validate destination ────────────────────────────────────────────
    if (!network.devices.has(destinationId)) {
      return err('ENTITY_NOT_FOUND', `Destination device ${destinationId} not found in network`, {
        role: 'destination',
        deviceId: destinationId,
      });
    }

    // ── 3. Source equals destination (local delivery) ───────────────────────
    // Valid: path = [source], hopCount = 0. NOT an error.
    if (sourceId === destinationId) {
      const route: Route = {
        sourceDeviceId: sourceId,
        destinationDeviceId: destinationId,
        hops: [],
        totalCost: 0,
      };
      return ok(route);
    }

    // ── 4. Interface → device lookup index ─────────────────────────────────
    // Derived on demand from the snapshot. This is a lookup helper, NOT a
    // duplicate topology. The Network snapshot remains authoritative.
    const interfaceToDevice = this._buildInterfaceIndex(network);

    // ── 5. Initialize BFS state ────────────────────────────────────────────
    const visited = new Set<DeviceId>();
    const parent = new Map<DeviceId, ParentEntry>();

    // Index-based queue: dequeue via head pointer → O(1), never Array.shift().
    const queue: DeviceId[] = [sourceId];
    let head = 0;

    visited.add(sourceId);

    // ── 6. BFS exploration ─────────────────────────────────────────────────
    while (head < queue.length) {
      const current = queue[head];
      head += 1;
      if (current === undefined) break; // Defensive: unreachable given head < length.

      const neighbors = this._getNeighbors(network, current, interfaceToDevice);

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.deviceId)) continue;

        visited.add(neighbor.deviceId);
        parent.set(neighbor.deviceId, { via: current, linkId: neighbor.linkId });

        // ── 7. Destination found → reconstruct immediately ────────────────
        if (neighbor.deviceId === destinationId) {
          return this._reconstructRoute(sourceId, destinationId, parent);
        }

        queue.push(neighbor.deviceId);
      }
    }

    // ── 8. Queue exhausted — destination unreachable ───────────────────────
    return err('NO_PATH', `No path found from ${sourceId} to ${destinationId}`, {
      sourceDeviceId: sourceId,
      destinationDeviceId: destinationId,
    });
  }

  // ─── Private: neighbor resolution (existing graph only) ───────────────────

  /**
   * Build a transient map from InterfaceId → owning DeviceId using ONLY the
   * existing network snapshot. Enables O(1) resolution of a link's remote
   * endpoint to its owner device during neighbor traversal.
   */
  private _buildInterfaceIndex(network: Network): Map<InterfaceId, DeviceId> {
    const index = new Map<InterfaceId, DeviceId>();
    for (const [deviceId, device] of network.devices) {
      for (const iface of device.interfaces.values()) {
        index.set(iface.id, deviceId);
      }
    }
    return index;
  }

  /**
   * Resolve the immediate device-level neighbors of `deviceId` from the
   * EXISTING network snapshot.
   *
   * For each interface on the device with a connectedLinkId, look up the
   * Link, determine the remote interface endpoint, and resolve which device
   * owns it. Ordering is deterministic: interfaces are iterated in insertion
   * order, matching the graph's natural ordering.
   *
   * Device-level self-loops (a link between two interfaces on the same
   * device) are excluded — they never produce a traversal hop.
   */
  private _getNeighbors(
    network: Network,
    deviceId: DeviceId,
    interfaceToDevice: Map<InterfaceId, DeviceId>,
  ): Neighbor[] {
    const device = network.devices.get(deviceId);
    if (!device) return [];

    const neighbors: Neighbor[] = [];

    for (const iface of device.interfaces.values()) {
      if (!iface.connectedLinkId) continue;

      const link = network.links.get(iface.connectedLinkId);
      if (!link) continue;

      const remoteInterfaceId = iface.id === link.endpointA ? link.endpointB : link.endpointA;

      const remoteDeviceId = interfaceToDevice.get(remoteInterfaceId);
      if (!remoteDeviceId) continue;

      // Skip device-level self-loops (link between two interfaces of the same device).
      if (remoteDeviceId === deviceId) continue;

      neighbors.push({ deviceId: remoteDeviceId, linkId: link.id });
    }

    return neighbors;
  }

  // ─── Private: path reconstruction ──────────────────────────────────────────

  /**
   * Reconstruct the ordered Route from source to destination using the
   * parent map recorded during BFS.
   *
   * Walks backward from destination → … → source using the predecessor
   * entries, then reverses the collected hops so the returned Route is
   * ordered source → destination. The RouteHop list does NOT include the
   * source device itself (existing Route convention), and `totalCost`
   * equals the number of hops for BFS (each edge costs 1).
   */
  private _reconstructRoute(
    sourceId: DeviceId,
    destinationId: DeviceId,
    parent: Map<DeviceId, ParentEntry>,
  ): Result<Route> {
    const hops: RouteHop[] = [];
    let current: DeviceId = destinationId;

    while (current !== sourceId) {
      const entry = parent.get(current);
      if (!entry) {
        return err(
          'INTERNAL_ERROR',
          `Path reconstruction failed: no parent recorded for device ${current}`,
          {
            sourceDeviceId: sourceId,
            destinationDeviceId: destinationId,
            failedDeviceId: current,
          },
        );
      }

      // Prepend: "to reach `current`, traverse entry.linkId from entry.via".
      hops.unshift({ deviceId: current, viaLinkId: entry.linkId });
      current = entry.via;
    }

    const route: Route = {
      sourceDeviceId: sourceId,
      destinationDeviceId: destinationId,
      hops,
      totalCost: hops.length,
    };

    return ok(route);
  }
}
