# Architectural Decision Records

This file records significant architectural decisions for the Mini Internet Simulator.
Each entry captures a decision, its rationale, and its consequences. Future milestones
refer back to these records.

---

## ADR-010: BFS is the first routing algorithm (Prompt 10)

- **Status**: Accepted — implemented
- **Date**: Prompt 10 milestone

### Context

The routing layer (`src/routing/RoutingAlgorithm.ts`) has existed as an interface since
Prompt 2 with no concrete algorithm. The roadmap deliberately introduces routing in stages:
BFS before Dijkstra before routing tables before dynamic routing. Prompt 10 is the point
where the first algorithm is implemented.

### Decision

1. **BFS is the first routing algorithm.** Every graph edge/connection is treated as having
   equal traversal cost. BFS answers _"what is the minimum-hop path from A to B?"_.
2. **BFS treats every edge equally.** No latency, cost, bandwidth, or other weight is
   considered. Weighted routing is deliberately deferred to Dijkstra (Prompt 11).
3. **BFS minimizes hop count.** The objective is the fewest graph edges between source and
   destination.
4. **Dijkstra will later introduce weighted routing.** Prompt 11 adds weights on top of the
   same `RoutingAlgorithm` interface.
5. **Routing tables will later consume routing results.** BFS is a query — it does not build
   tables. Table construction is a later milestone.
6. **Dynamic routing will be implemented later.** Distance Vector / Link State are future
   working modes, not part of BFS.

### Consequences

- The existing `RoutingAlgorithm.computeRoute(network, sourceId, destinationId)` interface
  is the single public entry point for pathfinding.
- The existing `Route` / `RouteHop` models are reused unchanged — no second `BfsPath` type.
- A new `NO_PATH` error code distinguishes disconnected graphs from invalid inputs.
- The packet engine is untouched: BFS answers the pathfinding question; packet forwarding/

---

## ADR-009: TTL behavior (Prompt 9)

- **Status**: Accepted — implemented

### Decision

- `Packet.ttl` defaults to 64 and is immutable after creation.
- Only `ROUTER` devices decrement TTL on forward (PCs/servers do not).
- TTL reaching 0 drops the packet with reason `TTL_EXPIRED` via the lifecycle state machine.
- TTL does not influence routing decisions.

### Consequences

- New error code `TTL_EXPIRED`; lifecycle transition reason `ttl_expired`.
- Packet identity identical across TTL changes; survives JSON serialization.

---

## ADR-008: Formal 5-state packet lifecycle (Prompt 8)

- **Status**: Accepted — implemented

### Decision

- Packet state is strictly `CREATED → QUEUED → FORWARDED → (DELIVERED | DROPPED)`.
- `transitionPacket()` is the ONLY legal mutation mechanism; direct `packet.state` assignment
  is forbidden.
- Append-only `lifecycleHistory[]` audit trail with deterministic ordinals.
- DELIVERED and DROPPED are terminal.

### Consequences

- Invalid transitions rejected with `SIMULATION_STATE_ERROR`.
- Full 5×5 transition validation matrix; immutability of identity fields.

---

## ADR-007: Device-level packet addressing (Prompt 7)

- **Status**: Accepted — implemented

### Decision

Packets move between **devices**, not interfaces. The model answers _"can a packet move from
Device A → Device B?"_ without premature interface-level routing complexity.

### Consequences

- Packet.source/destination are `DeviceId`s.
- PacketEngine validates every hop against NetworkGraph topology.
- Routing algorithms operate on device IDs (BFS preserves device-level identity; IPv4/subnet
  is not used as a graph id).

---

## ADR-006: IPv4/subnet canonical form (Prompt 6)

- **Status**: Accepted — implemented

### Decision

- Strict dotted-decimal validation (0–255 per octet).
- `prefixLength` (0–32) is the canonical subnet representation; dotted mask is derived.
- /31 and /32 host semantics respected.
- Each interface may live on an independent subnet; routers multi-home across subnets.

### Consequences

- Routers support per-interface subnets.
- BFS pathfinding operates on topology, not on IP addresses (IP is not a graph id).

---

## ADR-005: Routers require explicit ethernet interfaces (Prompt 5)

- **Status**: Accepted — implemented

### Decision

Routers start with **only** a loopback interface. Ethernet interfaces must be added
explicitly. PCs and servers get `lo` + `eth0` by default.

### Consequences

- Prevents callers from assuming one interface is sufficient for routing.
- DeviceFactory encodes the per-type default interface scheme.

---

## ADR-004: Single source of truth — NetworkGraph (Prompt 4)

- **Status**: Accepted — implemented

### Decision

`NetworkGraph` is the authoritative, mutable state container for topology. All other layers
(devices, packets, routing, UI mirror) read from it; nobody else mutates topology.

### Consequences

- Neighbors are derived on demand from the graph — no duplicate adjacency list anywhere.
- BFS reads `NetworkGraph.snapshot()` and never mutates it (read-only input).
- `snapshot()` produces defensive copies safe for routing and serialization.

---

## ADR-003: Type-safe branded IDs (Prompt 3)

- **Status**: Accepted — implemented

### Decision

Every entity type gets a branded nominal ID (`NetworkId`, `DeviceId`, `InterfaceId`,
`LinkId`, `PacketId`, `SimulationId`, `EventId`). All IDs flow through `IdFactory`.

### Consequences

- Prevents mixing entity types (e.g., passing a `DeviceId` where a `LinkId` is expected).
- BFS uses `DeviceId` as the node identity — never converts to IP addresses or strings.

---

## ADR-002: Result<T> error handling (Prompt 3)

- **Status**: Accepted — implemented

### Decision

Domain operations that can predictably fail return `Result<T>` (`{ok, value}` | `{ok:false,
error: SimulatorError}`) instead of throwing. Errors carry machine-readable codes.

### Consequences

- Routing returns `Result<Route>`: `ok(Route)` or `err('ENTITY_NOT_FOUND' | 'NO_PATH')`.
- BFS distinguishes invalid source, invalid destination, and NO_PATH via typed codes +
  rich context — not by returning an ambiguous empty array.

---

## ADR-001: Framework-independent simulator core (Prompt 1-2)

- **Status**: Accepted — implemented

### Decision

The simulator core contains zero framework code (no React, Express, database, WebSocket).
It is a pure TypeScript domain library runnable in any host.

### Consequences

- Tests run in a plain Node/Vitest environment (verified by ArchitectureBoundary tests).
- BFS is pure logic with no I/O, no randomness, no hidden state — deterministic and
  unit-testable in isolation.
  dropping remains the responsibility of the packet/lifecycle system.
