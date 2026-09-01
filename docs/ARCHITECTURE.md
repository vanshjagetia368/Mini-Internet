# Mini Internet — Architecture Document

> **Document Status**: v0.2.0 — Prompt 2 (Foundation) Complete.
> Prompt 1: ✅ Architecture Defined
> Prompt 2: ✅ Project Foundation, Tooling, and Dev Environment Implemented
> Prompt 3: ⏳ Core Domain Model (next phase)
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

| Forbidden dependency     | Reason                                              |
|--------------------------|-----------------------------------------------------|
| React                    | UI framework — domain must not know about rendering |
| React Flow               | Visual graph — domain must not know about visuals   |
| Express                  | HTTP server — domain must not know about transport  |
| WebSocket (ws)           | Communication — domain must not know about sockets  |
| PostgreSQL / pg          | Storage — domain must not know about persistence    |
| `window`, `document`     | Browser APIs — simulator runs in Node too           |

This means:
- Simulator can be unit tested without launching any server or browser
- Simulator can be replaced with a different implementation without touching React
- Simulator can run server-side in Node, in a Worker, or in a test runner

**Verified by TypeScript config**: `simulator/tsconfig.json` uses `lib: ["ES2022"]`
without `"DOM"` — browser globals are not available at compile time.

---

## 4. Client Responsibilities

The React frontend (`client/`) is responsible for:

| Responsibility          | Status       |
|-------------------------|--------------|
| Application shell (3-col layout)  | ✅ Prompt 2 |
| React + TypeScript + Vite foundation | ✅ Prompt 2 |
| Tailwind CSS + component styling | ✅ Prompt 2 |
| React Flow dependency installed | ✅ Prompt 2 |
| Visual network canvas   | Prompt 3      |
| Device placement        | Prompt 3      |
| Link creation UI        | Prompt 3      |
| Configuration forms     | Prompt 3      |
| Simulation controls     | Prompt 3      |
| Packet visualization    | Prompt 4      |
| Event log display       | Prompt 3      |
| Statistics display      | Phase 4 / Prompt 5+      |
| Presentation state      | Prompt 3      |

**The client must NOT:**
- Contain routing algorithms
- Decide whether a packet can be forwarded
- Maintain an authoritative network model
- Use React Flow node/edge IDs as domain entity IDs

---

## 5. Server Responsibilities

The Express server (`server/`) is responsible for:

| Responsibility                 | Status       |
|--------------------------------|--------------|
| HTTP API (Express)             | ✅ Prompt 2 |
| Health endpoint (/api/health)  | ✅ Prompt 2 |
| CORS + JSON middleware         | ✅ Prompt 2 |
| Config loading (dotenv)        | ✅ Prompt 2 |
| Application entry point        | ✅ Prompt 2 |
| Error handling foundation      | ✅ Prompt 2 |
| Directory structure (routes/controllers/middleware/services) | ✅ Prompt 2 |
| SimulationEngine instantiation | ✅ Prompt 2 |
| WebSocket server               | Prompt 3      |
| Broadcasting simulator events  | Prompt 3      |
| Command routing (API → engine) | Prompt 3      |
| Persistence integration        | Phase 3+ / Prompt 5+    |
| Authentication                 | Phase 4+ / Prompt 5+     |

**The server must NOT:**
- Duplicate routing logic
- Maintain a separate incompatible network model
- Make routing decisions independently

---

## 6. Simulator Responsibilities

The simulator engine (`simulator/`) is responsible for:

| Responsibility            | Status       |
|---------------------------|--------------|
| Authoritative network state| ✅ Prompt 2 |
| NetworkGraph (CRUD)       | ✅ Prompt 2 |
| EventBus (publish/subscribe) | ✅ Prompt 2 |
| SimulationEngine lifecycle| ✅ Prompt 2 |
| Device/interface/link CRUD| ✅ Prompt 2 |
| Failure injection         | ✅ Prompt 2 |
| Routing algorithm interface| ✅ Prompt 2 |
| Result/Error types        | ✅ Prompt 2 |
| IdFactory (branded IDs)   | ✅ Prompt 2 |
| Structured logger (Console/Silent) | ✅ Prompt 2 |
| Vitest + 23 passing unit tests | ✅ Prompt 2 |
| Architecture boundary tests (independence verified) | ✅ Prompt 2 |
| Directory structure (core/network/devices/interfaces/links/packets/routing/events/failures/simulation/types) | ✅ Prompt 2 |
| BFS routing               | Prompt 3      |
| Dijkstra routing          | Prompt 3      |
| Distance Vector routing   | Phase 4 / Prompt 4+      |
| Link State routing        | Phase 4 / Prompt 4+      |
| Packet simulation         | Prompt 3      |
| Latency / loss / queues   | Prompt 3      |
| Discrete event loop       | Prompt 3      |
| Metrics collection        | Phase 4 / Prompt 5+      |
| Deterministic PRNG        | Prompt 3      |

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

**Status: Interface established. No algorithms implemented yet.**

All routing algorithms implement `RoutingAlgorithm`:

```typescript
interface RoutingAlgorithm {
  readonly name: string;
  computeRoute(
    network: Network,
    sourceId: DeviceId,
    destinationId: DeviceId,
  ): Result<Route>;
}
```

Planned implementations in `simulator/src/routing/`:

| Algorithm        | Phase  | Description                      |
|------------------|--------|----------------------------------|
| BFS              | 3      | Unweighted shortest hop count    |
| Dijkstra         | 3      | Weighted shortest path           |
| Distance Vector  | 4      | RIP-style distributed routing    |
| Link State       | 4      | OSPF-style global topology       |

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
- BFS and Dijkstra routing implementations
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

| Entity    | Type           | Prefix  |
|-----------|----------------|---------|
| Network   | `NetworkId`    | `net_`  |
| Device    | `DeviceId`     | `dev_`  |
| Interface | `InterfaceId`  | `iface_`|
| Link      | `LinkId`       | `link_` |
| Packet    | `PacketId`     | `pkt_`  |
| Simulation| `SimulationId` | `sim_`  |
| Event     | `EventId`      | `evt_`  |

**Branded types** prevent passing a `DeviceId` where a `LinkId` is expected —
the TypeScript compiler enforces this at compile time.

---

## 13. Configuration Strategy

| Concern               | Location                  |
|-----------------------|---------------------------|
| Env var access        | `server/src/config/env.ts` only |
| Client env vars       | `VITE_` prefix (Vite exposes these) |
| Secrets               | Never in source code       |
| Example values        | `.env.example`             |
| Real values           | `.env` (gitignored)        |

---

*This document will be updated as phases are completed.*
*Do not document unimplemented features as if they already exist.*
