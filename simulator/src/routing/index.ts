/**
 * @file simulator/src/routing/index.ts
 *
 * Public exports for the routing module.
 *
 * The routing layer provides pathfinding algorithms that operate on the
 * existing NetworkGraph topology. BFS is the first implemented algorithm (Prompt 10);
 * Dijkstra adds weighted shortest-path routing (Prompt 11);
 * DynamicRoutingService adds automatic route recalculation (Prompt 13).
 */

export type {
  RoutingAlgorithm,
  RoutingAlgorithmName,
  Route,
  RouteHop,
} from './RoutingAlgorithm.js';

export { RoutingAlgorithmRegistry } from './RoutingAlgorithm.js';

export { BfsRouter } from './BfsRouter.js';

export { DijkstraRouter } from './DijkstraRouter.js';
export type { LinkWeightProvider } from './DijkstraRouter.js';

export { RoutingTable, RoutingTableBuilder } from './RoutingTable.js';
export type { RoutingTableEntry } from './RoutingTable.js';

export { DynamicRoutingService } from './DynamicRoutingService.js';

export { PriorityQueue } from './PriorityQueue.js';
