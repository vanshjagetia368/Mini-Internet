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

Current:
Packet lifecycle formalized (Prompt 8) with:

- Formal 5-state packet state machine: CREATED → QUEUED → FORWARDED → DELIVERED/DROPPED
- Centralized transition authority via `transitionPacket()` — no uncontrolled state mutation
- Allowed transition table: CREATED→{QUEUED}; QUEUED→{FORWARDED,DROPPED}; FORWARDED→{FORWARDED,DELIVERED,DROPPED}; DELIVERED/DROPPED terminal
- Terminal immutability enforced (DELIVERED and DROPPED never transition again)
- Invalid transition rejection with SIMULATION_STATE_ERROR for all forbidden paths
- Append-only lifecycleHistory audit trail per packet (from/to/reason/ordinal/atDeviceId)
- Separation of state vs currentLocation vs history (location traversal) vs lifecycleHistory (state transitions)
- PacketEngine integrated (createPacket/sendPacket/forwardPacket/deliverPacket/dropPacket all route through state machine)
- Transparent QUEUED→FORWARDED promotion during local delivery (preserves formal table)
- Structured transition reasons: send / forward / destination_reached / invalid_route / unreachable / no_route_to_host / invalid_packet / ttl_expired (reserved) / other
- Immutable identity on every transition (packet.id, source*, destination*, payload, createdAt never change)
- Defensive copies on all getters for registry lookups
- Full PacketStateMachine.test.ts suite (valid transitions, 5x5 invalid matrix, terminal immutability, multi-hop audit, multi-packet independence, drop preservation, serialization+rehydration, identity immutability, metadata)
- PacketEngine.test.ts updated to 5-state model with lifecycle history assertions
- Public exports from @mini-internet/simulator expose PACKET_STATES, ALLOWED_TRANSITIONS, TERMINAL_STATES, helpers, and types

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

Not yet implemented:

- TTL implementation (Prompt 9)
- Routing algorithms (BFS, Dijkstra) (Prompt 10)
- Routing tables
- Dynamic routing (Distance Vector / Link State)
- Simulation clock / event queue / step
- Frontend network editor
- WebSockets
- Real-time simulation
- Persistence
- Analytics
- Latency, bandwidth, packet loss, congestion conditions
