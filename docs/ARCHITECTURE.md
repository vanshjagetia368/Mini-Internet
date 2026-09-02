# Mini Internet — Architecture Document

> **Document Status**: v0.4.0 — Prompt 8 (Packet Lifecycle) Complete.
> Prompt 1: ✅ Architecture Defined
> Prompt 2: ✅ Project Foundation, Tooling, and Dev Environment Implemented
> Prompt 3: ✅ Core Domain Model
> Prompt 4: ✅ Network Graph Engine
> Prompt 5: ✅ Device Engine
> Prompt 6: ✅ IPv4/Subnet Engine
> Prompt 7: ✅ Packet Engine
> Prompt 8: ✅ Packet Lifecycle State Machine
> Clearly marks what is **implemented**, **planned**, or **future**.

---

## 1. What Is This Project?

Mini Internet is a browser-based network simulation laboratory. It allows users
to construct virtual network topologies, simulate packet transmission, observe
routing decisions, inject failures, and measure network behavior — all within
a browser.

The project is engineered as a **real simulation system**, not a visual
animation. The simulator independently represents network state and calculates
network behavior. The frontend visualizes the simulator rather than pretending
to be the network.

---

## 2. Architecture Overview

```
USER
 │
 ▼
REACT FRONTEND          (client/)
 │  commands / configuration
 ▼
SERVER LAYER            (server/)
 │  HTTP API, WebSocket
 ▼
SIMULATION ENGINE       (simulator/)
 ├── Network Graph
 ├── Devices / Interfaces / Links
 ├── Routing (abstraction layer)
 ├── Event Bus
 ├── Simulation Lifecycle
 └── Failures
 │  emits SimulationEvents
 ▼
EVENT CONSUMERS
 ├── WebSocket → Client visualization
 ├── Persistence → Database (Phase 3+)
 └── Tests → Assertions
```

---

## 3. The Simulator Is Independent

The `simulator/` package has **zero dependencies** on:

| Forbidden dependency | Reason                                              |
| -------------------- | --------------------------------------------------- |
| React                | UI framework — domain must not know about rendering |
| React Flow           | Visual graph — domain must not know about visuals   |
| Express              | HTTP server — domain must not know about transport  |
| WebSocket (ws)       | Communication — domain must not know about sockets  |
| PostgreSQL / pg      | Storage — domain must not know about persistence    |
| `window`, `document` | Browser APIs — simulator runs in Node too           |

This means:

- Simulator can be unit tested without launching any server or browser
- Simulator can be replaced with a different implementation without touching React
- Simulator can run server-side in Node, in a Worker, or in a test runner

**Verified by TypeScript config**: `simulator/tsconfig.json` uses `lib: ["ES2022"]`
without `"DOM"` — browser globals are not available at compile time.

---

## 4. Client Responsibilities

The React frontend (`client/`) is responsible for:

| Responsibility                       | Status              |
| ------------------------------------ | ------------------- |
| Application shell (3-col layout)     | ✅ Prompt 2         |
| React + TypeScript + Vite foundation | ✅ Prompt 2         |
| Tailwind CSS + component styling     | ✅ Prompt 2         |
| React Flow dependency installed      | ✅ Prompt 2         |
| Visual network canvas                | Prompt 3            |
| Device placement                     | Prompt 3            |
| Link creation UI                     | Prompt 3            |
| Configuration forms                  | Prompt 3            |
| Simulation controls                  | Prompt 3            |
| Packet visualization                 | Prompt 4            |
| Event log display                    | Prompt 3            |
| Statistics display                   | Phase 4 / Prompt 5+ |
| Presentation state                   | Prompt 3            |

**The client must NOT:**

- Contain routing algorithms
- Decide whether a packet can be forwarded
- Maintain an authoritative network model
- Use React Flow node/edge IDs as domain entity IDs

---

## 5. Server Responsibilities

The Express server (`server/`) is responsible for:

| Responsibility                                               | Status               |
| ------------------------------------------------------------ | -------------------- |
| HTTP API (Express)                                           | ✅ Prompt 2          |
| Health endpoint (/api/health)                                | ✅ Prompt 2          |
| CORS + JSON middleware                                       | ✅ Prompt 2          |
| Config loading (dotenv)                                      | ✅ Prompt 2          |
| Application entry point                                      | ✅ Prompt 2          |
| Error handling foundation                                    | ✅ Prompt 2          |
| Directory structure (routes/controllers/middleware/services) | ✅ Prompt 2          |
| SimulationEngine instantiation                               | ✅ Prompt 2          |
| WebSocket server                                             | Prompt 3             |
| Broadcasting simulator events                                | Prompt 3             |
| Command routing (API → engine)                               | Prompt 3             |
| Persistence integration                                      | Phase 3+ / Prompt 5+ |
| Authentication                                               | Phase 4+ / Prompt 5+ |

**The server must NOT:**

- Duplicate routing logic
- Maintain a separate incompatible network model
- Make routing decisions independently

---

## 6. Simulator Responsibilities

The simulator engine (`simulator/`) is responsible for:

| Responsibility                                                                                               | Status              |
| ------------------------------------------------------------------------------------------------------------ | ------------------- |
| Authoritative network state                                                                                  | ✅ Prompt 2         |
| NetworkGraph (CRUD)                                                                                          | ✅ Prompt 2         |
| EventBus (publish/subscribe)                                                                                 | ✅ Prompt 2         |
| SimulationEngine lifecycle                                                                                   | ✅ Prompt 2         |
| Device/interface/link CRUD                                                                                   | ✅ Prompt 2         |
| Device type queries                                                                                          | ✅ Prompt 5         |
| Interface management                                                                                         | ✅ Prompt 5         |
| MAC address generation                                                                                       | ✅ Prompt 5         |
| Device name uniqueness                                                                                       | ✅ Prompt 5         |
| Interface status management                                                                                  | ✅ Prompt 5         |
| Failure injection                                                                                            | ✅ Prompt 2         |
| Routing algorithm interface                                                                                  | ✅ Prompt 2         |
| Result/Error types                                                                                           | ✅ Prompt 2         |
| IdFactory (branded IDs)                                                                                      | ✅ Prompt 2         |
| Structured logger (Console/Silent)                                                                           | ✅ Prompt 2         |
| Vitest + 57 passing unit tests                                                                               | ✅ Prompt 5         |
| Architecture boundary tests (independence verified)                                                          | ✅ Prompt 2         |
| Directory structure (core/network/devices/interfaces/links/packets/routing/events/failures/simulation/types) | ✅ Prompt 2         |
| BFS routing                                                                                                  | ✅ Prompt 10        |
| Dijkstra routing                                                                                             | Prompt 11           |
| Distance Vector routing                                                                                      | Phase 4 / Prompt 6+ |
| Link State routing                                                                                           | Phase 4 / Prompt 6+ |
| Packet simulation                                                                                            | Prompt 7            |
| Latency / loss / queues                                                                                      | Prompt 7            |
| Discrete event loop                                                                                          | Prompt 7            |
| Metrics collection                                                                                           | Phase 4 / Prompt 8+ |
| Deterministic PRNG                                                                                           | Prompt 7            |

---

## 7. Domain / Infrastructure Boundaries

```
simulator/src/types/       ← Pure domain types. No framework imports.
simulator/src/network/     ← Authoritative state. No framework imports.
simulator/src/routing/     ← Routing abstraction + future implementations.
simulator/src/events/      ← EventBus. No WebSocket knowledge.
simulator/src/simulation/  ← Engine lifecycle + command dispatch.
simulator/src/core/        ← Shared utilities (logger).

server/src/config/         ← Env var access (isolated here only).
server/src/api/            ← Express routers.
server/src/websocket/      ← WebSocket integration (Phase 2).
server/src/services/       ← Application services (Phase 2+).

client/src/types/          ← Presentation types (CanvasNode, etc).
client/src/components/     ← React components.
client/src/features/       ← Feature-grouped components.
client/src/hooks/          ← Custom React hooks.
client/src/state/          ← UI state management.
client/src/services/       ← API/WebSocket client code.
```

**Dependency direction**: UI → Server → Simulator. Never reversed.

---

## 8. Routing Algorithm Abstraction

**Status: BFS implemented (Prompt 10). Dijkstra, Distance Vector, and Link State planned.**

All routing algorithms implement `RoutingAlgorithm`:

```typescript
interface RoutingAlgorithm {
  readonly name: string;
  computeRoute(network: Network, sourceId: DeviceId, destinationId: DeviceId): Result<Route>;
}
```

Implementations in `simulator/src/routing/`:

| Algorithm       | Phase | Description                   | Status       |
| --------------- | ----- | ----------------------------- | ------------ |
| BFS             | 3     | Unweighted shortest hop count | ✅ Prompt 10 |
| Dijkstra        | 3     | Weighted shortest path        | 🔜 Planned   |
| Distance Vector | 4     | RIP-style distributed routing | 🔜 Planned   |
| Link State      | 4     | OSPF-style global topology    | 🔜 Planned   |

### BFS Routing (`BfsRouter`)

`src/routing/BfsRouter.ts` implements BFS pathfinding over the existing
NetworkGraph snapshot (no second adjacency representation). It returns the
existing `Route` model (`hops` exclude the source; `totalCost` = hop count)
and uses an index-based queue, a `visited` Set, and a parent map for
reconstruction. Validates source/destination (`ENTITY_NOT_FOUND`), supports
source = destination (zero-hop route), returns typed `NO_PATH` when
disconnected, skips device self-loops, and is fully deterministic
(interface insertion order tie-breaking). Complexity: Time `O(V+E)`, Space `O(V)`.

**Key rule**: Packets ask the routing subsystem for forwarding information.
Packets do not implement routing themselves.

---

## 9. Command / Event Architecture

**Status: Types defined. Dispatch implemented. Broadcasting Phase 2.**

### Commands → Simulator

Requests sent TO the simulator. Validated and executed. May fail.

```
CREATE_DEVICE, REMOVE_DEVICE, CREATE_LINK, REMOVE_LINK
FAIL_NODE, RECOVER_NODE, FAIL_LINK, RECOVER_LINK
START_SIMULATION, PAUSE_SIMULATION, STOP_SIMULATION
SEND_PACKET (Phase 3)
SET_INTERFACE_IP (Phase 2)
```

### Events ← Simulator

Facts emitted AFTER successful mutations.

```
DEVICE_CREATED, DEVICE_REMOVED, LINK_CREATED, LINK_REMOVED
NODE_FAILED, NODE_RECOVERED, LINK_FAILED, LINK_RECOVERED
PACKET_CREATED, PACKET_FORWARDED, PACKET_DELIVERED, PACKET_DROPPED (Phase 3)
SIMULATION_STARTED, SIMULATION_PAUSED, SIMULATION_COMPLETED
```

Events flow: `SimulationEngine → EventBus → Server → WebSocket → Client`

---

## 10. Testing Architecture

**Status: Simulator unit tests passing. Server/client tests Phase 2.**

```
tests/
├── simulator/     ← Tests for domain logic (no browser, no server)
└── server/        ← Integration tests (Phase 2)
```

Co-located tests in simulator: `NetworkGraph.test.ts`, `EventBus.test.ts`

**Test runner**: Vitest (Node environment for simulator)

**Rule**: Core simulator tests must run without launching browser, React, Express, WebSocket, or PostgreSQL.

---

## 11. Planned Future Phases

### Phase 2 — Interactive UI + WebSocket

- React Flow canvas with device nodes and link edges
- Device palette and property panels
- WebSocket server integration (real-time event stream)
- Command dispatch: client → server → simulator
- Interface IP configuration
- Discrete simulation tick loop

### Phase 3 — Routing + Packet Simulation

- BFS routing implementation (✅ Prompt 10)
- Dijkstra routing implementation (prompt 11)
- Packet creation and forwarding
- TTL, packet drop, delivery events
- Latency and loss simulation
- Route visualization on canvas

### Phase 4 — Advanced Features

- Distance Vector and Link State routing
- Seeded PRNG for deterministic experiments
- Metrics collection (latency, throughput, loss rates)
- Analytics dashboard
- Experiment engine (scripted scenarios)

### Phase 5 — Persistence + Deployment

- PostgreSQL integration
- Save/load network configurations
- Simulation history storage
- Authentication
- Docker Compose production deployment
- CI/CD pipeline

---

## 12. Identity Rules

Every simulation entity has a branded ID type:

| Entity     | Type           | Prefix   |
| ---------- | -------------- | -------- |
| Network    | `NetworkId`    | `net_`   |
| Device     | `DeviceId`     | `dev_`   |
| Interface  | `InterfaceId`  | `iface_` |
| Link       | `LinkId`       | `link_`  |
| Packet     | `PacketId`     | `pkt_`   |
| Simulation | `SimulationId` | `sim_`   |
| Event      | `EventId`      | `evt_`   |

**Branded types** prevent passing a `DeviceId` where a `LinkId` is expected —
the TypeScript compiler enforces this at compile time.

---

## 13. Configuration Strategy

| Concern         | Location                            |
| --------------- | ----------------------------------- |
| Env var access  | `server/src/config/env.ts` only     |
| Client env vars | `VITE_` prefix (Vite exposes these) |
| Secrets         | Never in source code                |
| Example values  | `.env.example`                      |
| Real values     | `.env` (gitignored)                 |

---

## 14. Device Engine

The device engine provides comprehensive device and interface management built on top of the network graph foundation.

### Device Hierarchy

```
Network
  |
  +-- PC
  |    |
  |    +-- Interface (lo, eth0, eth1, ...)
  |
  +-- Router
  |    |
  |    +-- Interface (lo, eth0, eth1, eth2, ...)
  |
  +-- Server
       |
       +-- Interface (lo, eth0, eth1, ...)
```

### Device Types

The simulator supports the following device types:

| Type   | Description                | Typical Use                         |
| ------ | -------------------------- | ----------------------------------- |
| PC     | Personal computer/endpoint | End-user devices, clients           |
| ROUTER | Network router             | Multi-interface devices for routing |
| SERVER | Server                     | Backend services, hosts             |
| SWITCH | Network switch             | Layer 2 switching (future)          |

Device types are represented as a type-safe string union in the domain model:

```typescript
export type DeviceType = 'PC' | 'ROUTER' | 'SWITCH' | 'SERVER';
```

### Device Properties

Each device contains:

- **id**: Unique branded identifier (DeviceId)
- **name**: Human-readable name (must be unique within network)
- **type**: DeviceType (PC, ROUTER, SERVER, SWITCH)
- **status**: Operational status (UP/DOWN/DEGRADED)
- **interfaces**: Map of NetworkInterface objects

Device status is independent from deletion:

- **DOWN** means the device is operationally unavailable but still exists in topology
- **DELETED** means the device is removed from the network entirely

### Interface Model

Every interface belongs to exactly one device and contains:

- **id**: Unique branded identifier (InterfaceId)
- **deviceId**: Reference to owning device
- **name**: Interface name (e.g., "eth0", "eth1", "lo") - unique within device
- **macAddress**: MAC address in normalized format (XX:XX:XX:XX:XX:XX)
- **ipAddress**: IPv4 address (dotted-decimal) or null if unassigned
- **subnetMask**: Subnet mask or null if unassigned
- **status**: Operational status (UP/DOWN/DEGRADED)
- **connectedLinkId**: Reference to connected Link or null if disconnected

Interface status is independent from device status:

- An interface can be DOWN while its device is UP
- A device can be DOWN while its interfaces remain individually addressable

### MAC Address Model

MAC addresses are handled by the `MACAddress` class which provides:

- **Validation**: Ensures MAC addresses follow valid hex format with separators
- **Normalization**: Converts all MACs to uppercase with colon separators (XX:XX:XX:XX:XX:XX)
- **Generation**:
  - Random generation for production use (`MACAddress.generateLocal()`)
  - Deterministic generation for testing (`MACAddress.generateLocalForTesting(counter)`)

Deterministic generation uses a counter-based approach to ensure reproducible test results while still generating valid locally-administered unicast MAC addresses.

### IP Configuration Relationship

IP configuration is attached to interfaces, not devices:

```
Device
  |
  +-- Interface
       |
       +-- IPv4 configuration (address + subnet mask)
```

This design is critical because:

- Routers can have multiple interfaces on different networks
- Each interface needs its own IP configuration
- Future subnet logic operates on interface-level IP configuration

### Device Registry Operations

The NetworkGraph provides a complete device registry:

**Device Operations:**

- `addPc(name)` - Create PC with default loopback + eth0
- `addServer(name)` - Create Server with default loopback + eth0
- `addRouter(name)` - Create Router with default loopback only
- `addDevice(name, type)` - Generic device creation
- `removeDevice(id)` - Remove device and cascade connected links
- `getDevice(id)` - Get device by ID
- `getDeviceByName(name)` - Get device by name
- `hasDevice(id)` - Check device existence
- `deviceIds()` - Get all device IDs

**Type Query Operations:**

- `getRouters()` - Get all ROUTER type devices
- `getPcs()` - Get all PC type devices
- `getServers()` - Get all SERVER type devices
- `getDevicesByType(type)` - Generic type query

### Interface Management Operations

**Interface Operations:**

- `addInterface(deviceId, name, macAddress?)` - Add interface to device
- `removeInterface(deviceId, interfaceId)` - Remove interface (rejects if connected)
- `getInterface(deviceId, interfaceId)` - Get specific interface
- `hasInterface(deviceId, interfaceId)` - Check interface existence
- `getInterfaces(deviceId)` - Get all interfaces for device

**Interface Status Operations:**

- `failInterface(deviceId, interfaceId)` - Set interface to DOWN
- `recoverInterface(deviceId, interfaceId)` - Set interface to UP

### Validation Rules

**Device Validation:**

- Device IDs must be unique (enforced by IdFactory)
- Device names must be unique within network
- Device type must be valid DeviceType
- Device status must be valid OperationalStatus

**Interface Validation:**

- Interface IDs must be unique (enforced by IdFactory)
- Interface names must be unique within a device
- MAC addresses must be valid format
- MAC addresses are normalized to uppercase with colons
- Interface cannot be removed while connected to a link

**Graph Consistency:**

- Device removal cascades to remove connected links
- Interface removal rejects if interface is connected
- No dangling link references after deletions
- Self-connecting interfaces are prevented

### Graph Integration

The device engine is fully integrated with the network graph:

**When a device is added:**

```
Device → NetworkGraph._devices → Network → Graph
```

**When a device is removed:**

```
NetworkGraph.removeDevice() → cascade link removal → consistent topology
```

**When an interface is removed:**

```
NetworkGraph.removeInterface() → validate no links → safe removal
```

All device engine operations emit events through the EventBus:

- `DEVICE_CREATED` - When device is added
- `DEVICE_REMOVED` - When device is removed
- `DEVICE_UPDATED` - When device or interface state changes

### Serialization

The NetworkGraph's `snapshot()` method provides serializable device snapshots including:

**Device snapshot includes:**

- id
- name
- type
- status
- interfaces (complete map)

**Interface snapshot includes:**

- id
- name
- deviceId
- macAddress
- ipAddress
- subnetMask
- status
- connectedLinkId

Snapshots are deep copies that don't expose internal mutable state, making them safe for:

- Routing algorithm input
- Persistence layer storage
- WebSocket transmission
- Test assertions

### Design Principles

1. **Single Source of Truth**: NetworkGraph is the authoritative device registry
2. **Type Safety**: Branded ID types prevent mixing entity types
3. **Validation First**: All operations validate before mutation
4. **Event-Driven**: Successful mutations emit events for consumers
5. **Immutability**: Getters return copies, never references to internal state
6. **Graph Consistency**: Operations maintain topology invariants
7. **Testability**: Deterministic generation enables reproducible tests

---

## 15. Network Graph Engine

The `NetworkGraph` is the single source of truth for the simulator's topology.

- **Storage**: The graph is stored entirely in-memory using `Map`s for efficient ID-based lookup (`_devices` and `_links`).
- **Nodes & Links**: Nodes are modeled as `Device` entities containing a Map of `NetworkInterface`s. Links are modeled as `Link` entities that connect two specific `InterfaceId`s.
- **Adjacency Representation**: The graph traverses adjacency dynamically but deterministically. Instead of a duplicate adjacency list, neighbors are computed on demand by looking at all interfaces on a device, finding connected links (`iface.connectedLinkId`), and resolving the remote endpoint interface.
- **Mutation Rules**: Graph mutations are strictly centralized through methods like `addLink` and `addDevice`. Validations prevent invalid state transitions before modifying internal maps.
- **Duplicate Rules**: Because each interface can hold only one `connectedLinkId`, it is structurally impossible to have parallel duplicate physical links on the exact same endpoint pair (interface pair). Parallel links between the same devices are permitted if they use distinct interfaces.
- **Node-removal Behavior**: Removing a node operates using cascading deletes. All interfaces on the node are removed, which triggers the removal of all links connected to those interfaces. This guarantees no stale link references remain.
- **Link-removal Behavior**: Removing a link detaches it from both endpoint interfaces by setting their `connectedLinkId` to `null` and deletes the link entity. It does NOT remove the endpoint nodes.
- **Graph Invariants**: The graph strictly prevents self-connecting interfaces. Disconnected endpoints, duplicate names, and stale references after deletions are strictly prohibited. Devices and Links track `OperationalStatus` (UP/DOWN) without actually being removed from the topology.

---

---

## 16. Packet Lifecycle State Machine

**Status: Implemented (Prompt 8). Formal 5-state deterministic model with centralized transition authority and lifecycle audit trail.**

### 16.1 Overview

Every packet in the simulator progresses through a strictly-defined lifecycle represented by five canonical states. Transitions are validated centrally; no code outside the packet state machine may directly mutate `packet.state`. The three separate concepts of **state**, **location**, and **history** are never conflated.

### 16.2 States

| State       | Meaning                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `CREATED`   | Packet has been instantiated with source/destination/payload but not yet accepted into the processing pipeline.                                |
| `QUEUED`    | Packet has been accepted for transmission (`sendPacket`) and is ready to move to the next hop.                                                 |
| `FORWARDED` | Packet is in transit — it has left its previous hop and is moving toward the next. Remains `FORWARDED` across multiple hops (self-transition). |
| `DELIVERED` | **Terminal.** Packet has reached the intended destination device. No further transitions allowed.                                              |
| `DROPPED`   | **Terminal.** Packet was discarded for a documented reason before reaching its destination. No further transitions allowed.                    |

### 16.3 Allowed Transitions

```
CREATED
   │
   ▼
QUEUED ────────────────────────┐
   │                           │
   ▼                           ▼
FORWARDED ◄───┐           DROPPED (terminal)
   │          │
   ├──────────┘ (multi-hop self-loop)
   │
   ▼
DELIVERED (terminal)
```

Formal transition table:

| From state  | Allowed next states                 | Operation example                                                  |
| ----------- | ----------------------------------- | ------------------------------------------------------------------ |
| `CREATED`   | `{ QUEUED }`                        | `sendPacket` (accepted into pipeline)                              |
| `QUEUED`    | `{ FORWARDED, DROPPED }`            | `forwardPacket` or drop-in-queue                                   |
| `FORWARDED` | `{ FORWARDED, DELIVERED, DROPPED }` | Multi-hop forward, delivery at destination, drop during forwarding |
| `DELIVERED` | `{}` — terminal                     | _Never transitions again_                                          |
| `DROPPED`   | `{}` — terminal                     | _Never transitions again_                                          |

### 16.4 Invalid Transitions (Explicitly Rejected)

All transitions not listed in §16.3 are invalid. The following categories are explicitly disallowed:

- **Backward transitions**: `QUEUED → CREATED`, `FORWARDED → CREATED`, `FORWARDED → QUEUED`
- **Terminal mutation**: Any `DELIVERED → *` or `DROPPED → *` (cannot deliver-after-drop, forward-after-deliver, drop-after-deliver, queue-after-drop, etc.)
- **Creation short-circuits**: `CREATED → DELIVERED`, `CREATED → DROPPED`, `CREATED → FORWARDED` (a newly created packet must first be queued via `sendPacket` before any further processing)
- **Mid-pipeline short-circuits**: `QUEUED → DELIVERED` (when currentLocation == destination, the engine transparently promotes `QUEUED → FORWARDED → DELIVERED` in two formal steps, never skipping FORWARDED)

### 16.5 Transition Ownership

> **Hard rule:** No module, function, test, or consumer outside `simulator/src/packets/PacketStateMachine.ts` ever assigns to `packet.state`.

All state changes go through the single entry point:

```typescript
transitionPacket(packet: Packet, nextState: PacketState, opts: {
  reason: PacketTransitionReason | PacketDropReason;
  atDeviceId?: DeviceId;
}): Result<Packet>
```

- Returns a new `Packet` clone on success (never mutates input).
- Returns `SimulatorError { code: SIMULATION_STATE_ERROR }` with context `{ packetId, currentState, nextState, reason, terminal }` on disallowed transitions.
- Pure predicate helpers `isValidPacketTransition(cur,next)` and `isTerminalPacketState(s)` are exposed for consumers that need to query without mutating.

### 16.6 Lifecycle History (Audit Trail)

Every packet carries `packet.lifecycleHistory: PacketLifecycleTransition[]` — a monotonic, append-only log of state transitions, separate from `packet.history` (the location/device-traversal log) and `packet.currentLocation` (the present device).

Each entry records:

| Field        | Type                          | Meaning                                                                                                                                                               |
| ------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`       | `PacketState`                 | State before transition                                                                                                                                               |
| `to`         | `PacketState`                 | State after transition                                                                                                                                                |
| `reason`     | `PacketTransitionReason`      | Why this transition occurred (`send`, `forward`, `destination_reached`, `invalid_route`, `unreachable`, `no_route_to_host`, `invalid_packet`, `ttl_expired`, `other`) |
| `ordinal`    | `number` (1-based, monotonic) | Stable ordering for events before a simulation clock exists (Prompt 20 owns simulation time — wall-clock `Date.now`/`performance.now` is never used for ordering).    |
| `atDeviceId` | `DeviceId \| null`            | Device the packet was on when the transition fired, if locatable.                                                                                                     |

### 16.7 Packet Engine Integration

The five packet-engine operations route every state mutation through `transitionPacket`:

| Operation       | Transition(s) performed                                                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPacket`  | Sets initial state to `CREATED` (no transition call — the factory constructor sets it once).                                                                                                                                                                         |
| `sendPacket`    | `CREATED → QUEUED` with reason `send`.                                                                                                                                                                                                                               |
| `forwardPacket` | `QUEUED → FORWARDED` (first hop) or `FORWARDED → FORWARDED` (subsequent hops) with reason `forward`.                                                                                                                                                                 |
| `deliverPacket` | If `QUEUED` (local delivery, already at destination): first `QUEUED → FORWARDED`, then `FORWARDED → DELIVERED` with reason `destination_reached`. If already `FORWARDED`: direct `FORWARDED → DELIVERED`. Always verifies `currentLocation === destinationDeviceId`. |
| `dropPacket`    | `QUEUED → DROPPED` or `FORWARDED → DROPPED` with a mapped structured drop reason. Rejects terminal packets.                                                                                                                                                          |

### 16.8 Immutable Identity Fields

The following are set once at creation and never change on any lifecycle transition (enforced by `transitionPacket` returning a clone that reuses the original reference):

- `id`
- `sourceDeviceId`, `destinationDeviceId`
- `sourceIp`, `destinationIp`
- `payload`
- `createdAt`

### 16.9 Extensibility for Future Prompts

The state machine is designed so subsequent prompts can hook in without modifying the transition table or validation core:

- **Prompt 9 (TTL)**: Can invoke `dropPacket(pkt, TTL_EXPIRED)` directly. The `ttl_expired` reason union tag already exists in `PacketTransitionReason`; Prompt 9 only needs to add the caller that actually triggers it.
- **Prompt 10 (Routing)**: `forwardPacket`'s existing signature accepts an explicit next-hop device ID, so BFS/Dijkstra can be plugged in as the caller without touching the state machine itself.
- **Prompt 20 (Simulation clock)**: The `ordinal` field will be co-sorted with (or eventually replaced by) a simulation tick; today's ordering via ordinal guarantees deterministic sort regardless.

---

_This document will be updated as phases are completed._
_Do not document unimplemented features as if they already exist._
