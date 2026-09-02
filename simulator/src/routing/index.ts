/**
 * @file simulator/src/routing/index.ts
 *
 * Public exports for the routing module.
 *
 * The routing layer provides pathfinding algorithms that operate on the
 * existing NetworkGraph topology. BFS is the first implemented algorithm;
 * Dijkstra and others will be added in future milestones.
 */

export type {
  RoutingAlgorithm,
  RoutingAlgorithmName,
  Route,
  RouteHop,
} from './RoutingAlgorithm.js';

export { RoutingAlgorithmRegistry } from './RoutingAlgorithm.js';

export { BfsRouter } from './BfsRouter.js';
