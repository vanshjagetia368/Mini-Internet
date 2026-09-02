# Project Roadmap / TODO

## Completed Milestones

- ✅ **Prompt 1** — Architectural contract, three-layer architecture, workspace structure
- ✅ **Prompt 2** — Project foundation, tooling, dev environment, test harness
- ✅ **Prompt 3** — Core domain model (devices, links, interfaces, packets, routing abstraction)
- ✅ **Prompt 4** — Network graph engine (single source of truth)
- ✅ **Prompt 5** — Device engine
- ✅ **Prompt 6** — IPv4 / subnet engine
- ✅ **Prompt 7** — Packet engine
- ✅ **Prompt 8** — Packet lifecycle (5-state machine)
- ✅ **Prompt 9** — TTL
- ✅ **Prompt 10 — BFS routing / pathfinding**

## Current Milestone

**Prompt 10 — BFS routing**: DONE.

- `BfsRouter` implements minimum-hop unweighted pathfinding over the existing NetworkGraph.
- Reuses `Route` / `RouteHop`; returns `Result<Route>`; typed `NO_PATH`.
- 17 tests covering local delivery, direct/multi-hop, branching, multiple shortest paths,
  cycles, disconnected networks, invalid endpoints, single-node, path validity,
  shortest-path property, NetworkGraph integration, diamond scenario, self-loops,
  and no-mutation guarantees.

## Next Milestones (NOT started — do NOT implement ahead of instruction)

- 🔜 **Prompt 11 — Dijkstra weighted routing** (weighted shortest path)
- 🔜 **Prompt 12 — Routing tables / next-hop tables**
- 🔜 **Prompt 13 — Dynamic routing (Distance Vector / Link State)**
- 🔜 Simulation clock / event queue / step
- 🔜 Frontend network editor + visualization
- 🔜 WebSockets / real-time simulation
- 🔜 Network conditions (latency, bandwidth, loss, congestion)
- 🔜 Failure recovery / DOWN-UP handling
- 🔜 Persistence / analytics

## Explicit Scope Boundaries

- **BFS**: unweighted, hop-count objective only. NO weights, NO costs, NO priority queue.
- **No pathfinding ↔ packet integration yet**: PacketEngine still decides forwarding itself.
- **No real-world networking**: no sockets, ARP, DNS, ICMP, OS routing tables.
- **Deterministic**: no randomness anywhere in BFS tie-breaking.
