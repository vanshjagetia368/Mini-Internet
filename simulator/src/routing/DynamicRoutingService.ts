/**
 * @file simulator/src/routing/DynamicRoutingService.ts
 *
 * Dynamic routing service that automatically recalculates routing tables
 * when the network topology changes.
 *
 * This service subscribes to topology change events and ensures that routing
 * tables are always up-to-date with the current network state. It reuses the
 * existing RoutingTableBuilder with BFS or Dijkstra algorithms.
 *
 * ARCHITECTURE:
 *   NetworkGraph mutations
 *       ↓
 *   EventBus emits topology events
 *       ↓
 *   DynamicRoutingService subscribes
 *       ↓
 *   Routes invalidated (DIRTY state)
 *       ↓
 *   Routes recalculated via RoutingTableBuilder
 *       ↓
 *   Routing tables rebuilt atomically
 *       ↓
 *   ROUTING_TABLES_UPDATED event emitted
 *
 * SCOPE (Prompt 13):
 *   - Event-driven route recalculation on topology changes
 *   - Support for both BFS and Dijkstra algorithms
 *   - Atomic table updates to prevent partial state
 *   - Stale route removal
 *   - Multiple independent routers
 *   - Correct next-hop and interface resolution
 *
 * NOT IMPLEMENTED (future milestones):
 *   - Distance Vector / Link State routing protocols
 *   - Incremental route updates
 *   - Route aggregation / CIDR matching
 *   - Default routes
 */

import type { DeviceId, EventId } from '../types/ids.js';
import type { Network } from '../types/domain.js';
import type { RoutingAlgorithm } from './RoutingAlgorithm.js';
import { RoutingTableBuilder, RoutingTable } from './RoutingTable.js';
import type { EventBus } from '../events/EventBus.js';
import type { SimulationEvent } from '../types/events.js';
import type { Logger } from '../core/logger.js';
import { IdFactory } from '../types/ids.js';
import type { NetworkGraph } from '../network/NetworkGraph.js';

// ─── Routing State ─────────────────────────────────────────────────────────────

/**
 * Internal routing state tracking.
 */
type RoutingState = 'VALID' | 'DIRTY';

// ─── DynamicRoutingService ─────────────────────────────────────────────────────

/**
 * Dynamic routing service that maintains up-to-date routing tables.
 *
 * The service subscribes to topology change events and automatically
 * recalculates routing tables for all routers when the network changes.
 *
 * Usage:
 *   const service = new DynamicRoutingService(
 *     networkGraph,
 *     eventBus,
 *     new BfsRouter(),
 *     logger
 *   );
 *   await service.initialize();
 *   const table = service.getRoutingTable(routerId);
 */
export class DynamicRoutingService {
  private readonly network: NetworkGraph;
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly algorithm: RoutingAlgorithm;
  private readonly builder: RoutingTableBuilder;

  private routingTables = new Map<DeviceId, RoutingTable>();
  private routingState: RoutingState = 'DIRTY';
  private unsubscribeCallbacks: Array<() => void> = [];

  /**
   * Create a new dynamic routing service.
   *
   * @param network - The network graph (will be snapshotted on recalculation)
   * @param eventBus - Event bus for topology change notifications
   * @param algorithm - Routing algorithm to use (BFS or Dijkstra)
   * @param logger - Logger for diagnostics
   */
  constructor(
    network: NetworkGraph,
    eventBus: EventBus,
    algorithm: RoutingAlgorithm,
    logger: Logger,
  ) {
    this.network = network;
    this.eventBus = eventBus;
    this.algorithm = algorithm;
    this.logger = logger;
    this.builder = new RoutingTableBuilder(algorithm);
  }

  /**
   * Initialize the service by subscribing to topology events.
   * Call this after construction to enable automatic recalculation.
   */
  initialize(): void {
    this.logger.info('DynamicRoutingService initializing', { algorithm: this.algorithm.name });

    // Subscribe to topology change events
    this.unsubscribeCallbacks.push(
      this.eventBus.on('DEVICE_CREATED', this._onTopologyChange.bind(this)),
      this.eventBus.on('DEVICE_REMOVED', this._onTopologyChange.bind(this)),
      this.eventBus.on('LINK_CREATED', this._onTopologyChange.bind(this)),
      this.eventBus.on('LINK_REMOVED', this._onTopologyChange.bind(this)),
      this.eventBus.on('NODE_FAILED', this._onTopologyChange.bind(this)),
      this.eventBus.on('NODE_RECOVERED', this._onTopologyChange.bind(this)),
      this.eventBus.on('LINK_FAILED', this._onTopologyChange.bind(this)),
      this.eventBus.on('LINK_RECOVERED', this._onTopologyChange.bind(this)),
    );

    // Initial calculation
    this.recalculateRoutes();

    this.logger.info('DynamicRoutingService initialized', { algorithm: this.algorithm.name });
  }

  /**
   * Shutdown the service by unsubscribing from events.
   */
  shutdown(): void {
    this.logger.info('DynamicRoutingService shutting down');
    for (const unsubscribe of this.unsubscribeCallbacks) {
      unsubscribe();
    }
    this.unsubscribeCallbacks = [];
    this.routingTables.clear();
  }

  /**
   * Explicitly recalculate all routing tables.
   *
   * This method is called automatically on topology changes, but can also
   * be called explicitly if needed (e.g., after batch topology mutations).
   */
  recalculateRoutes(): void {
    this.logger.debug('Recalculating routing tables', { algorithm: this.algorithm.name });

    // Build new tables atomically from current network snapshot
    const snapshot = this.network.snapshot();
    const newTables = this.builder.buildAll(snapshot);

    // Replace old tables with new ones (atomic swap)
    this.routingTables = newTables;
    this.routingState = 'VALID';

    this.logger.info('Routing tables recalculated', {
      algorithm: this.algorithm.name,
      routerCount: this.routingTables.size,
    });

    // Emit event to notify subscribers
    this._emitRoutingTablesUpdated();
  }

  /**
   * Get the routing table for a specific router.
   *
   * If the routing state is DIRTY, this triggers recalculation before returning.
   *
   * @param routerId - The device ID of the router
   * @returns The routing table, or undefined if the router has no table
   */
  getRoutingTable(routerId: DeviceId): RoutingTable | undefined {
    // Auto-recalculate if dirty
    if (this.routingState === 'DIRTY') {
      this.recalculateRoutes();
    }

    return this.routingTables.get(routerId);
  }

  /**
   * Get all current routing tables.
   *
   * If the routing state is DIRTY, this triggers recalculation before returning.
   *
   * @returns A map of router ID → routing table
   */
  getAllRoutingTables(): Map<DeviceId, RoutingTable> {
    // Auto-recalculate if dirty
    if (this.routingState === 'DIRTY') {
      this.recalculateRoutes();
    }

    // Return a copy to prevent external mutation
    return new Map(this.routingTables);
  }

  /**
   * Check if a router has a routing table.
   *
   * @param routerId - The device ID of the router
   * @returns true if the router has a routing table
   */
  hasRoutingTable(routerId: DeviceId): boolean {
    return this.routingTables.has(routerId);
  }

  /**
   * Get the routing algorithm used by this service.
   */
  getAlgorithm(): RoutingAlgorithm {
    return this.algorithm;
  }

  /**
   * Get the current routing state.
   */
  getRoutingState(): RoutingState {
    return this.routingState;
  }

  // ─── Private: Event Handlers ────────────────────────────────────────────────

  /**
   * Handle topology change events by marking routing as DIRTY.
   */
  private _onTopologyChange(event: SimulationEvent): void {
    this.logger.debug('Topology change detected, marking routing as DIRTY', {
      eventType: event.type,
    });

    this.routingState = 'DIRTY';

    // Note: We don't recalculate immediately here to avoid excessive
    // recalculations if multiple topology changes happen in quick succession.
    // Recalculation happens on-demand when tables are queried.
  }

  /**
   * Emit ROUTING_TABLES_UPDATED event.
   */
  private _emitRoutingTablesUpdated(): void {
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'ROUTING_TABLES_UPDATED',
      routerCount: this.routingTables.size,
      simulationTime: 0, // TODO: Use actual simulation time when tick loop is implemented
      wallClockMs: Date.now(),
    });
  }
}
