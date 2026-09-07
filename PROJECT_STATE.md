# Project State

Completed:
✓ Core repository
✓ Development foundation
✓ Core domain foundation
✓ Network graph engine
✓ Device engine
✓ IPv4/subnet engine
✓ Packet engine
✓ Packet lifecycle
✓ TTL
✓ BFS routing / pathfinding
✓ Dijkstra weighted routing
✓ Routing tables
✓ Dynamic route calculation

Current:
Dynamic route calculation (Prompt 13) complete with:

- `DynamicRoutingService` — automatic routing table recalculation on topology changes
- Event-driven architecture: subscribes to topology change events (DEVICE_CREATED, DEVICE_REMOVED, LINK_CREATED, LINK_REMOVED, NODE_FAILED, NODE_RECOVERED, LINK_FAILED, LINK_RECOVERED)
- DIRTY/VALID state tracking to avoid unnecessary recalculations
- Atomic table updates: complete new tables built before replacing old ones
- Automatic recalculation on topology changes with lazy evaluation (on-demand)
- Explicit `recalculateRoutes()` method for manual triggering
- Supports both BFS and Dijkstra algorithms (configurable via constructor)
- Integration with SimulationEngine: service initialized on simulation start, shutdown on stop
- New `ROUTING_TABLES_UPDATED` event emitted when tables are recalculated
- Query methods: `getRoutingTable(routerId)`, `getAllRoutingTables()`, `hasRoutingTable(routerId)`
- State tracking: `getRoutingState()` returns current DIRTY/VALID status
- Reuses existing `RoutingTableBuilder` with BFS/Dijkstra algorithms
- Prevents stale routes by rebuilding complete tables on each recalculation
- Supports multiple independent routers with separate routing tables
- Correct next-hop resolution (first hop, not final destination)
- Correct interface resolution (router's own interface on the link to next hop)
- Preserves algorithm-specific costs (BFS hop count, Dijkstra weighted cost)
- Handles unreachable destinations (no entry created, not an error)
- 20 comprehensive tests covering all dynamic routing scenarios
- Exported from package public API (index.ts)

BFS routing (Prompt 10), Dijkstra routing (Prompt 11), and routing tables (Prompt 12) complete with:

- First routing algorithm implemented (BfsRouter)
- Minimum-hop (unweighted) pathfinding using Breadth-First Search
- Operates on the existing NetworkGraph snapshot (no duplicate adjacency)
- Reuses the existing Route / RouteHop domain models (no new route type)
- Deterministic neighbor ordering (interface insertion order)
- Index-based queue (O(1) dequeue; no Array.shift())
- Visited Set<DeviceId> prevents infinite traversal on cyclic graphs
- Parent/predecessor map enables O(path length) reconstruction
- Source = destination → zero-hop route ([A], hopCount 0) — valid local delivery
- Invalid source/destination → typed ENTITY_NOT_FOUND with role context
- Disconnected source/destination → typed NO_PATH error
- Device-level self-loops skipped during traversal (never a hop)
- Complexity: Time O(V + E), Space O(V)
- 17 new unit/integration tests (353 total simulator tests passing)
- `NO_PATH` added to SimulatorErrorCode
- Exported from the package public API (index.ts)

Packet engine complete with:

- Packet domain model (device-level addressing)
- Packet processing operations (create, send, forward, deliver, drop)
- Packet registry (active and completed packets)
- Type-safe packet drop reasons
- Integration with NetworkGraph for topology validation
- Integration with EventBus for packet lifecycle events
- Integration with SimulationEngine for command dispatch
- Comprehensive test suite
- Local delivery support (source=destination)
- Architecture documentation (ARCHITECTURE.md §16)

IPv4 / subnet engine complete with:

- IPv4 validation (strict dotted-decimal 0–255)
- Prefix length validation (0–32)
- Subnet mask ↔ prefix length conversion (contiguous only)
- Network address calculation (host bits cleared)
- Broadcast address calculation (host bits set)
- Same-subnet check (masked comparison)
- CIDR parsing (A.B.C.D/N)
- Host validation with /31 and /32 semantics
- Interface IP integration with prefixLength as canonical
- Subnet helpers: getInterfaceSubnet, network, broadcast, host validity
- Router multi-subnet support (per-interface independent subnets)
- 183 unit tests passing

Dijkstra weighted routing complete with:

- `DijkstraRouter` implements weighted shortest-path using a binary min-heap (`PriorityQueue`)
- Uses the `Link.cost` field as the routing metric (non-negative)
- Injectable `LinkWeightProvider` allows alternative metrics (e.g. delayMs)
- Validates and rejects negative edge costs with `INVALID_TOPOLOGY`
- Complexity: Time O((V+E) log V), Space O(V)
- With uniform costs, produces identical results to BFS
- 25 unit tests passing

Routing tables complete with:

- `RoutingTable` — immutable, per-router forwarding table keyed by destination
- `RoutingTableBuilder` — transforms algorithm output into forwarding decisions
  - `buildForRouter(network, routerId)` → `Result<RoutingTable>`
  - `buildAll(network)` → `Map<DeviceId, RoutingTable>` (one per router)
- `RoutingTableEntry` — `{ destination, nextHop, cost, interfaceId }`
  - `nextHop` is the first device after the router on the path (not the final destination)
  - `interfaceId` is the router's own outgoing interface (not the neighbor's)
- Validates router type (`INVALID_COMMAND` for non-routers) and existence (`ENTITY_NOT_FOUND`)
- Unreachable destinations silently skipped; no self-entries
- 21 tests passing (5 RoutingTable unit tests + 16 RoutingTableBuilder tests)

Not yet implemented:

- Distance Vector / Link State routing protocols
- Simulation clock / event queue / step
- Frontend network editor
- WebSockets
- Real-time simulation
- Persistence
- Analytics
- Latency, bandwidth, packet loss, congestion conditions
