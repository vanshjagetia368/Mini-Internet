# Mini Internet Simulator Architecture

## Overview

The Mini Internet Simulator is a network simulation engine designed for educational purposes. It provides a framework-independent domain model for simulating network topologies, devices, packets, and routing algorithms.

## Core Architectural Principles

1. **Framework Independence**: The simulator core contains no framework-specific code (no React, Express, database ORM decorators)
2. **Single Source of Truth**: NetworkGraph is the authoritative mutable state container
3. **Event-Driven**: All state changes emit events through the EventBus
4. **Type Safety**: Branded ID types and Result<T> error handling
5. **Separation of Concerns**: Clear boundaries between graph, devices, packets, and routing

## Domain Model

### Network (`Network`)

The top-level container for a network topology. A Network owns devices and links; devices own interfaces.

```typescript
interface Network {
  readonly id: NetworkId;
  readonly name: string;
  readonly createdAt: number;
  readonly devices: ReadonlyMap<DeviceId, Device>;
  readonly links: ReadonlyMap<LinkId, Link>;
}
```

### Device (`Device`)

A simulated network device (PC, Router, Switch, Server). Devices do NOT know about their visual position — that is presentation state owned by the client.

```typescript
interface Device {
  readonly id: DeviceId;
  readonly name: string;
  readonly type: DeviceType;
  readonly status: OperationalStatus;
  readonly interfaces: ReadonlyMap<InterfaceId, NetworkInterface>;
}
```

### Network Interface (`NetworkInterface`)

A network interface belonging to a device. An interface can be connected to exactly one Link endpoint.

```typescript
interface NetworkInterface {
  readonly id: InterfaceId;
  readonly deviceId: DeviceId;
  readonly name: string;
  readonly macAddress: string;
  readonly ipAddress: string | null;
  readonly prefixLength: number | null;
  readonly subnetMask: string | null;
  readonly status: OperationalStatus;
  readonly connectedLinkId: LinkId | null;
}
```

### Link (`Link`)

A simulated network link (cable / virtual connection) between two interfaces. Links connect interfaces, not devices directly.

```typescript
interface Link {
  readonly id: LinkId;
  readonly endpointA: InterfaceId;
  readonly endpointB: InterfaceId;
  readonly status: OperationalStatus;
  readonly bandwidthBps: number | null;
  readonly delayMs: number;
  readonly lossRate: number;
}
```

## Subsystems

### NetworkGraph Engine

**File**: `src/network/NetworkGraph.ts`

The authoritative, mutable network state container. This class is the single source of truth for network topology.

**Responsibilities**:

- Device and interface CRUD operations
- Link creation and management
- Topology queries (neighbors, connected links, device lookups)
- Failure injection (devices, links, interfaces)
- Snapshot generation for serialization

**Key Design**: Internally mutable (Map) for efficiency, exposes readonly views to prevent external mutation.

### Device Engine

**File**: `src/devices/DeviceFactory.ts`

A stateless factory for creating network devices with validated defaults.

**Responsibilities**:

- Device creation with type-specific defaults
- Interface management
- Prevention of invalid/partial device creation

**Device Defaults**:

- PC → loopback (lo) + eth0
- SERVER → loopback (lo) + eth0
- ROUTER → loopback (lo) only (eth interfaces added explicitly)

### IPv4/Subnet Engine

**Files**: `src/network/ipv4/IPv4Address.ts`, `src/network/ipv4/IPv4Subnet.ts`

Domain model for IPv4 addresses and subnets with strict validation.

**Responsibilities**:

- IPv4 address validation (strict dotted-decimal 0–255)
- Prefix length validation (0–32)
- Subnet mask ↔ prefix length conversion (contiguous only)
- Network address calculation
- Broadcast address calculation
- Same-subnet check
- CIDR parsing

### Packet Engine

**File**: `src/packets/PacketEngine.ts`

Core packet processing engine for packet lifecycle management.

**Responsibilities**:

- Create, send, forward, deliver, and drop packets
- Validate all packet operations against network topology
- Maintain packet registry (active and completed packets)
- Emit packet lifecycle events
- Delegate ALL state mutations to `PacketStateMachine.transitionPacket()` — no uncontrolled state assignment

**Packet Domain Model**:

```typescript
interface Packet {
  readonly id: PacketId;
  readonly sourceDeviceId: DeviceId;
  readonly destinationDeviceId: DeviceId;
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly payload: string;
  readonly ttl: number; // Time-to-live, default 64
  currentLocation: DeviceId;
  state: PacketState;
  readonly history: DeviceId[];
  readonly lifecycleHistory: PacketLifecycleTransition[];
  readonly createdAt: number;
  readonly metadata?: Record<string, unknown>;
}
```

**Key Design Decisions**:

- **Device-level addressing**: Packets move between devices, not interfaces. This keeps the implementation focused on "Can a packet move from Device A → Device B through the topology?" without premature interface-level routing complexity.
- **No routing logic**: PacketEngine validates next hops but does NOT calculate routes. Route calculation is the responsibility of future routing algorithms.
- **Topology respect**: All forwarding validated against NetworkGraph
- **Local delivery support**: Source = destination is allowed for valid local communication. When delivering a QUEUED packet already at the destination, the engine transparently promotes QUEUED→FORWARDED then FORWARDED→DELIVERED so the formal state-machine table remains strict.
- **Extensibility**: Metadata field for future features (interface-level addressing, QoS)
- **Separate history concepts**:
  - `history` = ordered device-traversal path (location hops)
  - `lifecycleHistory` = ordered state-machine transitions (audit trail)

### TTL (Time To Live)

**File**: `src/packets/Packet.ts`, `src/packets/PacketEngine.ts`

Time-to-live implementation for packet lifetime management during network traversal.

**Responsibilities**:

- Set default TTL to 64 on packet creation
- Validate TTL values (must be non-negative integers)
- Decrement TTL on router forwarding hops
- Drop packets with TTL_EXPIRED reason when TTL reaches 0
- Preserve packet identity through TTL changes

**TTL Field**:

```typescript
interface Packet {
  readonly ttl: number; // Default 64, immutable after creation
}
```

**Router Decrement Semantics**:

- Only ROUTER device types decrement TTL
- PCs and Servers do NOT decrement TTL
- TTL decrements exactly once per router hop
- TTL is never reset during packet lifetime

**Expiration Behavior**:

```
TTL = 1 at router
   ↓
Decrement to 0
   ↓
Packet dropped with TTL_EXPIRED
   ↓
State becomes DROPPED
```

**TTL Flow Example**:

```
Packet (TTL = 64)
   |
   | TTL = 64
   ↓
PC1 (non-router)
   |
   | TTL = 64 (unchanged)
   ↓
Router 1
   |
   | TTL = 63 (decremented)
   ↓
Router 2
   |
   | TTL = 62 (decremented)
   ↓
Destination
```

**TTL Validation**:

- TTL must be a non-negative integer
- Rejects negative values, NaN, fractional numbers, and Infinity
- Custom TTL can be set via packet creation options (for testing)

**Lifecycle Integration**:

TTL expiration uses the existing packet lifecycle:

- Expired packets transition to DROPPED state
- Drop reason is TTL_EXPIRED (structured, not generic error)
- Terminal state immutability prevents resurrection
- TTL is recorded in packet metadata for inspection

**Key Design Rules**:

- TTL is immutable after creation (packet identity principle)
- Only routers decrement TTL, not PCs or servers
- TTL = 0 means expired, packet is dropped before forwarding
- TTL does not influence routing decisions (deferred to future prompts)
- TTL survives JSON serialization and reconstruction

**Separation from Routing**: PacketEngine ≠ RoutingEngine. The packet engine answers "Given the next hop, can the packet be forwarded?" while routing engines answer "Which route is best?"

### Packet Lifecycle State Machine

**Files**: `src/packets/PacketStateMachine.ts`, `src/packets/Packet.ts`

Formal, deterministic 5-state lifecycle machine. The authoritative transition authority — no code outside the state machine is allowed to assign `packet.state` directly.

**States** (in lifecycle order):

| State       | Description                                                                      |
| ----------- | -------------------------------------------------------------------------------- |
| `CREATED`   | Packet exists but has not entered the processing pipeline. Initial state only.   |
| `QUEUED`    | Packet accepted for transmission (CREATED → QUEUED by `sendPacket`).             |
| `FORWARDED` | Packet is moving through the network. Remains FORWARDED across multiple hops.    |
| `DELIVERED` | **Terminal.** Packet reached destinationDeviceId. No further transitions.        |
| `DROPPED`   | **Terminal.** Packet discarded with a structured reason. No further transitions. |

**Allowed Transition Table** (single source of truth: `ALLOWED_PACKET_TRANSITIONS`):

```
CREATED
   │
   ▼
QUEUED ─────────────────────────────► DROPPED
   │
   ▼
FORWARDED ──────────────────────────► DROPPED
   │  │
   │  └──── FORWARDED (multi-hop loop, self-transition)
   ▼
DELIVERED
```

| From        | To allowed                          |
| ----------- | ----------------------------------- |
| `CREATED`   | `QUEUED`                            |
| `QUEUED`    | `FORWARDED`, `DROPPED`              |
| `FORWARDED` | `FORWARDED`, `DELIVERED`, `DROPPED` |
| `DELIVERED` | _(terminal, none)_                  |
| `DROPPED`   | _(terminal, none)_                  |

**Invalid transitions explicitly rejected** (return `SIMULATION_STATE_ERROR`):

- All backward jumps: QUEUED→CREATED, FORWARDED→CREATED, FORWARDED→QUEUED
- CREATED directly to FORWARDED / DELIVERED / DROPPED (bypassing queue)
- Anything ← DELIVERED (cannot touch a delivered packet)
- Anything ← DROPPED (cannot resurrect a dropped packet)

**Transition Ownership** (the only callers that legitimately drive state):

| Engine Method     | Transition(s) Triggered                                                       | Structured Reason                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `createPacket()`  | (sets initial = CREATED, no entry in lifecycleHistory)                        | —                                                                                                                      |
| `sendPacket()`    | CREATED → QUEUED                                                              | `send`                                                                                                                 |
| `forwardPacket()` | QUEUED → FORWARDED (first hop) <br> FORWARDED → FORWARDED (subsequent hops)   | `forward`                                                                                                              |
| `deliverPacket()` | QUEUED → FORWARDED → DELIVERED (local convenience) <br> FORWARDED → DELIVERED | `forward`, `destination_reached`                                                                                       |
| `dropPacket()`    | QUEUED → DROPPED <br> FORWARDED → DROPPED                                     | `invalid_route`, `unreachable`, `no_route_to_host`, `invalid_packet`, `ttl_expired` _(reserved for Prompt 9)_, `other` |

**Controlled Transition Function**:

```typescript
function transitionPacket(
  packet: Packet,
  nextState: PacketState,
  opts: { reason: PacketTransitionReason | PacketDropReason; atDeviceId?: DeviceId },
): Result<Packet>;
```

Guarantees:

1. Validates against the transition table before any mutation.
2. Returns a **clone** of the packet — the input reference is never mutated in place.
3. Never touches `id`, `sourceDeviceId`, `destinationDeviceId`, `sourceIp`, `destinationIp`, `payload`, `createdAt`.
4. Appends an append-only `PacketLifecycleTransition` record with a **monotonic ordinal** (1-based, gap-free):
   ```typescript
   {
     (from, to, reason, ordinal, atDeviceId);
   }
   ```
5. Terminal states always reject — once DELIVERED or DROPPED, every attempt returns an error.

**Active vs Completed Packets** (registry semantics):

- _Active_: CREATED, QUEUED, FORWARDED — non-terminal, in-flight.
- _Completed_: DELIVERED, DROPPED — terminal, immutable lifecycle.

**Serialization & Rehydration**: All 5 states (and the lifecycleHistory array) survive JSON round-trips. `hasReachedState(packet, target)` can answer "did this packet ever reach state X?" using either current state or lifecycle-history records.

### Routing Algorithm Interface

**File**: `src/routing/RoutingAlgorithm.ts`

The routing algorithm abstraction — the core extension point for all future routing strategy implementations.

**Current State**: Interface established. BFS implemented (Prompt 10). Dijkstra, Distance Vector, and Link State planned.

**Implementations**:

- ✅ BFS (breadth-first search shortest path, unweighted minimum hops)
- 🔜 Dijkstra (shortest weighted path)
- 🔜 Distance Vector (RIP-style)
- 🔜 Link State (OSPF-style)

**Design**: All routing decisions go through this interface. Devices and packets do not implement routing logic themselves.

### BFS Routing

**File**: `src/routing/BfsRouter.ts`

**Status**: Implemented (Prompt 10).

**Purpose**: The first routing algorithm. Answers _"what is the minimum-hop path from device A to device B through the current network topology?"_ treating every graph edge as equal cost (unweighted). Dijkstra (Prompt 11) will later add weighted edge costs.

**Integration**: BFS operates on the read-only `Network` snapshot produced by `NetworkGraph.snapshot()`. It does NOT maintain a second adjacency list — device neighbors are resolved on demand from the existing devices/interfaces/links topology using a transient `InterfaceId → DeviceId` index rebuilt per call. The packet engine is untouched (no routing in packets).

**Algorithm**:

1. Validate source exists → `ENTITY_NOT_FOUND` (context `{ role: 'source' }`).
2. Validate destination exists → `ENTITY_NOT_FOUND` (context `{ role: 'destination' }`).
3. If `source === destination`, return a zero-hop route (path `[A]`, `totalCost = 0`) — valid local delivery, not an error.
4. Initialize an **index-based queue** (`head` pointer, O(1) dequeue, never `Array.shift()`).
5. Track `visited: Set<DeviceId>` — a node enters the BFS frontier at most once (cycle-safe; terminates on any graph).
6. Track `parent: Map<DeviceId, { via: DeviceId; linkId: LinkId }>` — predecessor/link used to first reach each node.
7. On discovering the destination, reconstruct immediately by walking `parent` backward and reversing → ordered source-to-destination route.
8. If the queue exhausts, return `NO_PATH` (disconnected graph).

**Result format**: Reuses the existing `Route` model:

```text
sourceDeviceId
destinationDeviceId
hops:       [ { deviceId, viaLinkId }, ... ]   // source NOT included (existing convention)
totalCost:  hop count                          // each edge cost 1
```

**Complexity**: Time `O(V + E)`; Space `O(V)` (visited + parent + queue), where `V` = devices, `E` = links.

**Determinism / tie-breaking**: Neighbors are returned in each device's interface iteration order (Map insertion order). No randomness, no shuffling. When multiple minimum-hop paths exist, the first-discovered deterministic path is returned.

**Edge cases covered**: source = destination; invalid source; invalid destination; disconnected network; cycles; device self-loops (excluded from neighbor expansion); multiple shortest paths.

**Files**:

- `src/routing/BfsRouter.ts` — implementation
- `src/routing/RoutingAlgorithm.ts` — `RoutingAlgorithm` interface, `Route`, `RouteHop`, registry (unchanged from Prompt 2/3)
- `src/routing/index.ts` — module barrel
- `src/routing/BfsRouter.test.ts` — 17 tests (unit + NetworkGraph integration)

### Event System

**File**: `src/events/EventBus.ts`

A minimal, typed event bus for simulation events.

**Responsibilities**:

- Event subscription (type-specific and wildcard)
- Event emission
- Event type safety

**Design**: Simple observer pattern. No external dependencies.

### Simulation Engine

**File**: `src/simulation/SimulationEngine.ts`

The top-level coordinator for a running simulation.

**Responsibilities**:

- Hold the authoritative NetworkGraph
- Accept commands and delegate to appropriate subsystems
- Emit SimulationEvents through the EventBus
- Manage simulation lifecycle (start/pause/resume/stop)
- Coordinate packet operations via PacketEngine

**Current State**: Foundation with lifecycle state machine and command dispatch skeleton.

## ID System

**File**: `src/types/ids.ts`

Branded ID types for every simulation entity to prevent type errors.

```typescript
type NetworkId = Brand<string, 'NetworkId'>;
type DeviceId = Brand<string, 'DeviceId'>;
type InterfaceId = Brand<string, 'InterfaceId'>;
type LinkId = Brand<string, 'LinkId'>;
type PacketId = Brand<string, 'PacketId'>;
type SimulationId = Brand<string, 'SimulationId'>;
type EventId = Brand<string, 'EventId'>;
```

**ID Factory**: Centralized ID generation using `IdFactory` for consistent ID creation across the codebase.

## Error Handling

**File**: `src/types/errors.ts`

Typed error hierarchy with Result<T> pattern.

```typescript
class SimulatorError extends Error {
  constructor(
    public readonly code: SimulatorErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  )
}

type Result<T> =
  { readonly ok: true; readonly value: T } |
  { readonly ok: false; readonly error: SimulatorError };
```

**Design**: Never use generic `Error` across domain boundaries. Errors must be machine-readable for serialization and client display.

## Command/Event Separation

**Commands** (`src/types/commands.ts`): Requests for future actions sent TO the simulator.

**Events** (`src/types/events.ts`): Facts about the past emitted BY the simulator.

This separation enables:

- Command validation and error handling
- Event-driven architecture for consumers (server, persistence, tests)
- Clear audit trail of simulation state changes

## Implementation Phases

### Phase 1: Foundation ✅

- Core repository setup
- Development foundation
- Core domain foundation

### Phase 2: Topology ✅

- Network graph engine
- Device engine
- IPv4/subnet engine

### Phase 3: Packet Engine ✅

- Packet domain model
- Packet lifecycle operations (create/send/forward/deliver/drop)
- Packet registry (active/completed)
- NetworkGraph topology validation

### Phase 4: Packet Lifecycle ✅

- Formal 5-state machine: CREATED → QUEUED → FORWARDED → (DELIVERED | DROPPED)
- Authoritative transition table — no uncontrolled `packet.state` assignment
- `transitionPacket()` as the ONLY legal state-mutation mechanism
- Terminal-state immutability (DELIVERED and DROPPED never transition again)
- Append-only `lifecycleHistory` audit trail per packet (from / to / reason / ordinal / atDeviceId)
- Validated transitions: 5×5 matrix — every invalid combination rejected with `SIMULATION_STATE_ERROR`
- Structured transition reasons (`send`, `forward`, `destination_reached`, `invalid_route`, `unreachable`, `no_route_to_host`, `invalid_packet`, `ttl_expired`, `other`)
- PacketEngine fully integrated (all five lifecycle methods route through the state machine)
- Immutable packet identity across every transition (id / source / destination / payload / createdAt)
- Full state-machine test suite + PacketEngine integration tests updated

### Phase 5: TTL ✅

- Time-to-live implementation with default TTL = 64
- TTL field added to Packet domain model
- TTL validation (non-negative integers only)
- Router-only decrement semantics (PCs and servers do not decrement)
- TTL_EXPIRED drop reason integration with lifecycle state machine
- Centralized TTL decrement helper function
- Comprehensive TTL test suite (default, custom, validation, decrement, expiration, independence)
- TTL survives JSON serialization
- Architecture documentation updated with TTL section

### Phase 6: Routing ✅ (BFS complete — Dijkstra & routing tables pending)

- ✅ BFS pathfinding (Prompt 10): minimum-hop routes, typed NO_PATH, deterministic
- 🔜 Dijkstra algorithm (Prompt 11): weighted shortest path
- 🔜 Routing table management (Prompt 12)

### Phase 7: Advanced Routing (Planned)

- Distance Vector
- Link State
- Dynamic route computation

### Phase 8: Network Conditions (Planned)

- Latency simulation
- Packet loss modeling
- Bandwidth constraints
- Congestion simulation

### Phase 9: Real-time Simulation (Planned)

- Simulation clock
- Tick-based execution
- Time management

### Phase 10: Event System (Planned)

- Complete event engine
- Event persistence
- Event replay

## Key Architectural Rules

1. **Single Source of Truth**: NetworkGraph is the only place where topology state lives
2. **No Silent Mutations**: All state changes go through controlled methods
3. **Event-Driven**: All state changes emit events
4. **Type Safety**: Use branded types and Result<T> pattern
5. **Framework Independence**: Core simulation has no framework dependencies
6. **Separation of Concerns**: Clear boundaries between subsystems
7. **No Routing in Packets**: Packets do not implement routing logic
8. **Topology Authority**: Graph topology is always authoritative
9. **Immutable Exports**: External consumers get readonly snapshots
10. **Extensibility**: Design for future features without breaking existing code

## Testing Strategy

- Unit tests for each subsystem
- Integration tests for cross-subsystem interactions
- Topology validation tests
- Packet lifecycle tests
- Event emission verification
- Error handling tests

## Future Considerations

- **Persistence**: Event sourcing for simulation replay
- **Analytics**: Packet statistics and performance metrics
- **Visualization**: Packet animation and path highlighting
- **Scalability**: Large topology support
- **Real-time Features**: WebSocket integration for live simulation
