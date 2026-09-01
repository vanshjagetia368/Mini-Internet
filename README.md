# Mini Internet — Network Simulation Laboratory

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-24-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![Tests](https://img.shields.io/badge/tests-23%20passing-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](#)

A browser-based network simulation laboratory that lets you construct virtual
network topologies, simulate packet routing, inject failures, and observe
real-time network behavior.

This project is engineered as a **real simulation system**, not a visual
animation. The simulator independently represents network state and calculates
network behavior. The frontend visualizes the simulator rather than pretending
to be the network.

---

## Implementation Status

| Prompt / Phase | Status | Description |
|----------------|--------|-------------|
| **Prompt 1** | ✅ **COMPLETE** | Architectural contract defined. Three-layer architecture, workspace structure, domain boundaries established. |
| **Prompt 2** | ✅ **COMPLETE** | Project foundation, tooling, workspace, dev environment, client shell, server health endpoint, simulator test harness. |
| **Prompt 3** | ⏳ **NEXT** | Core domain model — devices, links, interfaces, packets, BFS/Dijkstra routing, forwarding logic. |

> **Current Version**: v0.2.0 — Foundation Complete (Prompt 2)

---

## What Is Implemented Now (Prompt 2)

### Workspace & Tooling
- ✅ npm workspaces with three packages: `client`, `server`, `simulator`
- ✅ TypeScript strict mode across all packages (noImplicitAny, strictNullChecks, etc.)
- ✅ ESLint (TypeScript + React rules) + Prettier formatting
- ✅ Vitest test runner (Node environment for simulator)
- ✅ Build outputs: `simulator/dist`, `server/dist`, `client/dist`
- ✅ Cross-package scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `format`
- ✅ `.env.example` with configuration categories documented
- ✅ `.gitignore` for dependencies, builds, secrets, IDE files

### Client (`client/`)
- ✅ React 19 + TypeScript + Vite application
- ✅ Tailwind CSS 3 + PostCSS configured
- ✅ `@xyflow/react` (React Flow v12) dependency installed (for Phase 3 canvas)
- ✅ Minimal 3-column application shell (palette / canvas / inspector)
- ✅ Event log panel placeholder (bottom)
- ✅ Clean, dark-themed layout ("Mini Internet" branding visible)
- ⚠️ **No fake network data, no fake topology, no fake animations**

### Server (`server/`)
- ✅ Node.js + TypeScript + Express 4 foundation
- ✅ CORS + JSON body parsing middleware
- ✅ Structured config loading via dotenv (`server/src/config/env.ts`)
- ✅ Health endpoint: `GET /api/health` → `{ status: "ok", ... }`
- ✅ 404 fallback + clean entry point
- ✅ SimulationEngine instance bootstrapped at startup
- ✅ All simulator events subscribed (currently logged; Phase 3 → WebSocket broadcast)
- ✅ Directory structure: `api/{routes,controllers,middleware}`, `services/`, `types/`, `app/`, `config/`, `websocket/`
- ⚠️ **No persistence, no WebSocket connections yet, no REST API for simulation**

### Simulator (`simulator/`)
- ✅ **Framework-independent package** (0 imports of React / Express / DOM / WebSocket / pg)
- ✅ Compile-time enforcement via `tsconfig.json` → `lib: ["ES2022"]` only, no DOM
- ✅ **23 unit tests passing** (3 test files) running in pure Node environment
- ✅ Architecture boundary tests: validates no browser globals leaked in
- ✅ `IdFactory` for branded types (`net_`, `dev_`, `iface_`, `link_`, `pkt_`, `sim_`, `evt_`)
- ✅ `Result<T,E>` type with `ok()` / `err()` + `SimulatorError` exceptions
- ✅ Structured logger with `ConsoleLogger` and `SilentLogger` variants
- ✅ `NetworkGraph` — authoritative topology state (devices, interfaces, links CRUD)
- ✅ `EventBus` — typed publish/subscribe (used to notify consumers of mutations)
- ✅ `RoutingAlgorithm` interface + registry (no implementations yet)
- ✅ `SimulationEngine` — command dispatch, lifecycle states, configuration
- ✅ Directory structure: `core/`, `network/`, `devices/`, `interfaces/`, `links/`, `packets/`, `routing/`, `events/`, `failures/`, `simulation/`, `types/`
- ⚠️ **No routing algorithms (BFS/Dijkstra) implemented yet**
- ⚠️ **No packet forwarding, TTL, latency, or loss simulation yet**

### Documentation
- ✅ `README.md` (this file) — purpose, setup, commands, status
- ✅ `docs/ARCHITECTURE.md` — full architectural contract with status tables
- ✅ Architecture principles documented with status per-component

---

## What Is NOT Yet Implemented (Coming in Prompt 3+)

| Feature Category | Prompt | Details |
|------------------|--------|---------|
| **Domain model** | Prompt 3 | Real device behavior (Router/PC/Server), IP subnets, interface IP configuration |
| **Routing** | Prompt 3 | BFS, Dijkstra routing algorithm implementations, routing table computation |
| **Packets** | Prompt 3 | Packet creation, TTL, forwarding, delivery, drop events |
| **Network canvas** | Prompt 3 | React Flow-based interactive canvas, drag-and-drop device placement, link drawing |
| **Command dispatch** | Prompt 3 | Client → Server API commands → Simulator dispatch |
| **WebSockets** | Prompt 3 | Server broadcasts simulation events to all connected clients in real time |
| **Inspector panels** | Prompt 3 | Device properties, link configuration, packet inspection UI |
| **Simulation controls** | Prompt 3 | Start/Pause/Stop, step-through controls, packet send UI |
| **Failures & recovery** | Prompt 3 | Node failure, link failure, recovery UI, observation of routing reconvergence |
| **Latency / loss / queues** | Prompt 3 | Queuing delay simulation, packet loss probability, bandwidth limits |
| **Analytics** | Prompt 4+ | Metrics collection, throughput/latency dashboards, experiment results |
| **Advanced routing** | Prompt 4+ | Distance Vector (RIP), Link State (OSPF) distributed algorithms |
| **Persistence** | Prompt 5+ | PostgreSQL integration, save/load topologies, simulation history storage |
| **Authentication** | Prompt 5+ | User accounts, login, shared topologies |
| **Docker deploy** | Prompt 5+ | Production Docker Compose, CI/CD pipeline |

---

## Architecture

This project follows a **strict layered architecture with one-way dependencies**:

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (React + React Flow + Vite)                         │
│  ────────────────────────────────────────────────────────   │
│  Visualization ONLY.                                        │
│  Renders canvas, devices, packets, events.                  │
│  Sends user commands via HTTP / WebSocket.                  │
│  NEVER decides routing or packet forwarding.                │
└─────────────────────┬───────────────────────────────────────┘
                      │ commands (DTOs only)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVER (Node.js + Express + WebSocket)                     │
│  ────────────────────────────────────────────────────────   │
│  Transport & orchestration ONLY.                            │
│  Validates requests, invokes simulator, broadcasts events.  │
│  NEVER duplicates routing logic or topology state.          │
└─────────────────────┬───────────────────────────────────────┘
                      │ invokes
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  SIMULATOR (Pure TypeScript — framework-independent)        │
│  ────────────────────────────────────────────────────────   │
│  AUTHORITATIVE source of truth.                             │
│  Owns all network state, routing, forwarding, failures.     │
│  Emits SimulationEvents via EventBus.                       │
│  ZERO React / Express / DOM / DB imports.                   │
└─────────────────────────────────────────────────────────────┘
```

The **simulator is the source of truth for all network behavior**. The client
is a read-only view projected from simulator events.

**Dependency direction: UI → Server → Simulator. Never reversed.**

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full design contract.

---

## Architecture Principles

1. **Simulator Independence**: The simulator package MUST NEVER import React,
   React Flow, Express, WebSocket (`ws`), PostgreSQL (`pg`), or browser globals
   (`window`, `document`, `localStorage`). It runs identically in Node tests
   and on the server. This is verified by `ArchitectureBoundary.test.ts`.

2. **Routing in the Domain Layer**: All routing algorithms (`calculateRoute`,
   `forwardPacket`, routing table computation) live in `simulator/src/routing/`.
   Never in React components, never in Express handlers.

3. **Branded Identity Types**: Every domain entity has a branded ID type
   (`DeviceId`, `LinkId`, etc.). The TypeScript compiler prevents accidentally
   passing a `DeviceId` where a `LinkId` is expected. React Flow node/edge IDs
   are *presentation* IDs, not domain IDs.

4. **Commands → Events**: Users issue `SimulationCommand`s (create device, fail
   link, send packet). The simulator processes them and emits
   `SimulationEvent`s after successful mutation. Events flow out to all
   consumers (UI, persistence, tests) via the EventBus.

5. **Test Without The Browser**: Core simulator tests pass in pure Node with no
   DOM, no React, no server process, no database. Run them instantly with
   `npm run test --workspace=simulator`.

---

## Project Structure

```
mini-internet/
├── client/          React + Vite + React Flow frontend
├── server/          Node.js + Express API server
├── simulator/       TypeScript simulation engine (framework-independent)
├── tests/           Cross-package integration tests
├── docs/            Architecture and API documentation
└── docker/          Dockerfile and Docker Compose
```

---

## Quick Start

### Prerequisites

- Node.js 24+
- npm 11+

### Setup

```bash
# Clone the repository
git clone https://github.com/vanshjagetia368/Mini-Internet.git
cd Mini-Internet

# Copy environment example
cp .env.example .env

# Install all workspace dependencies
npm install

# Run simulator tests
npm run test --workspace=simulator

# Type-check all workspaces
npm run typecheck
```

### Development

```bash
# Start client + server in parallel
npm run dev

# Or start individually:
npm run dev --workspace=client    # http://localhost:5173
npm run dev --workspace=server    # http://localhost:3001
```

### Commands Reference

| Command                                    | Description                        |
|--------------------------------------------|------------------------------------|
| `npm install`                              | Install all workspace dependencies |
| `npm run dev`                              | Start client + server (parallel)   |
| `npm run build`                            | Build all workspaces               |
| `npm run typecheck`                        | Type-check all workspaces          |
| `npm run lint`                             | Lint all workspaces                |
| `npm run test`                             | Run all tests                      |
| `npm run test --workspace=simulator`       | Run simulator unit tests only      |
| `npm run format`                           | Format all files with Prettier     |

---

## Technology Stack

| Layer     | Technology                       | Reason                                  |
|-----------|----------------------------------|-----------------------------------------|
| Frontend  | React 19, TypeScript, Vite       | Fast DX, type safety                    |
| Canvas    | @xyflow/react (React Flow v12)   | Interactive network graph visualization |
| Styling   | Tailwind CSS                     | Utility-first, consistent design system |
| Backend   | Node.js, Express, TypeScript     | Unified TS stack, familiar ecosystem    |
| Simulator | Pure TypeScript                  | Framework-independent domain logic      |
| Testing   | Vitest                           | Fast, TypeScript-native test runner     |
| Container | Docker + Docker Compose          | Reproducible environments               |
| Database  | PostgreSQL (Phase 3+)            | Reliable relational persistence         |

---

## Contributing

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the engineering rules
that all contributors must follow.

Key rules:
1. The simulator must never import React, Express, or browser APIs.
2. Routing logic belongs in `simulator/src/routing/` — never in React components.
3. All entity IDs are domain-generated branded types — not React Flow IDs.
4. New features must have unit tests that run without a browser.
