/**
 * @file simulator/src/routing/RoutingAlgorithm.ts
 *
 * The routing algorithm abstraction — the core extension point for all future
 * routing strategy implementations.
 *
 * ARCHITECTURAL RULE:
 *   Packets do not implement routing logic themselves.
 *   Devices do not implement routing logic themselves.
 *   All routing decisions go through this interface.
 *
 * This allows the following implementations to be added without changing
 * any other part of the codebase:
 *   - BFS (breadth-first search shortest path)
 *   - Dijkstra (shortest weighted path)
 *   - Distance Vector (RIP-style)
 *   - Link State (OSPF-style)
 *   - Custom / experimental algorithms
 *
 * CURRENT STATE: Interface + placeholder. No algorithms implemented.
 * See docs/ARCHITECTURE.md — "Planned: Routing Algorithms".
 */

import type { DeviceId, LinkId } from '../types/ids.js';
import type { Network } from '../types/domain.js';
import type { Result } from '../types/errors.js';

// ─── Route Types ──────────────────────────────────────────────────────────────

/**
 * A single hop in a computed route.
 * Describes: "to get from sourceDevice toward destinationDevice,
 *             traverse this link to reach nextHopDevice."
 */
export interface RouteHop {
  readonly deviceId: DeviceId;
  readonly viaLinkId: LinkId;
}

/**
 * A complete computed route from source to destination.
 */
export interface Route {
  readonly sourceDeviceId: DeviceId;
  readonly destinationDeviceId: DeviceId;
  /** Ordered list of hops. Does NOT include the source device itself. */
  readonly hops: ReadonlyArray<RouteHop>;
  /** Total estimated path cost (semantics depend on the algorithm). */
  readonly totalCost: number;
}

// ─── Routing Algorithm Interface ──────────────────────────────────────────────

/**
 * Every routing algorithm must implement this interface.
 *
 * `computeRoute` accepts the current network graph and two device IDs,
 * and returns either a Route or a SimulatorError.
 *
 * IMPORTANT: `computeRoute` must be pure — given the same inputs, it must
 * return the same output. No hidden state, no side effects.
 * This supports deterministic testing and reproducible experiments.
 */
export interface RoutingAlgorithm {
  /** Human-readable name for display and logging. */
  readonly name: string;

  /**
   * Compute the best route from source to destination through network.
   *
   * Returns ok(Route) on success, err(...) if no route exists or inputs
   * are invalid.
   *
   * MUST NOT modify the network object.
   * MUST be deterministic for the same (network, source, destination) inputs.
   */
  computeRoute(network: Network, sourceId: DeviceId, destinationId: DeviceId): Result<Route>;
}

// ─── Algorithm Registry ───────────────────────────────────────────────────────

/**
 * Named routing algorithm variants.
 * Extend this union as new algorithms are implemented.
 */
export type RoutingAlgorithmName = 'BFS' | 'DIJKSTRA' | 'DISTANCE_VECTOR' | 'LINK_STATE';

/**
 * Registry mapping algorithm names to their implementations.
 * The active simulation uses one algorithm at a time, selected via config.
 *
 * PLACEHOLDER: No algorithms are registered yet. This will be populated
 * in later implementation stages.
 */
export class RoutingAlgorithmRegistry {
  private readonly algorithms = new Map<RoutingAlgorithmName, RoutingAlgorithm>();

  register(name: RoutingAlgorithmName, algorithm: RoutingAlgorithm): void {
    this.algorithms.set(name, algorithm);
  }

  get(name: RoutingAlgorithmName): RoutingAlgorithm | undefined {
    return this.algorithms.get(name);
  }

  list(): RoutingAlgorithmName[] {
    return Array.from(this.algorithms.keys());
  }
}
