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
- Enforce packet state machine invariants

**Packet Domain Model**:
```typescript
interface Packet {
  readonly id: PacketId;
  readonly sourceDeviceId: DeviceId;
  readonly destinationDeviceId: DeviceId;
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly payload: string;
  currentLocation: DeviceId;
  state: PacketState;
  readonly history: DeviceId[];
  readonly createdAt: number;
  readonly metadata?: Record<string, unknown>;
}
```

**Packet Lifecycle**: CREATED → IN_TRANSIT → (DELIVERED | DROPPED)

**Key Design Decisions**:
- **Device-level addressing**: Packets move between devices, not interfaces. This keeps the implementation focused on "Can a packet move from Device A → Device B through the topology?" without premature interface-level routing complexity.
- **No routing logic**: PacketEngine validates next hops but does NOT calculate routes. Route calculation is the responsibility of future routing algorithms.
- **Topology respect**: All forwarding validated against NetworkGraph
- **Local delivery support**: Source = destination is allowed for valid local communication
- **Extensibility**: Metadata field for future features (TTL, interface-level addressing, QoS)

**Separation from Routing**: PacketEngine ≠ RoutingEngine. The packet engine answers "Given the next hop, can the packet be forwarded?" while routing engines answer "Which route is best?"

### Routing Algorithm Interface

**File**: `src/routing/RoutingAlgorithm.ts`

The routing algorithm abstraction — the core extension point for all future routing strategy implementations.

**Current State**: Interface + placeholder. No algorithms implemented yet.

**Planned Implementations**:
- BFS (breadth-first search shortest path)
- Dijkstra (shortest weighted path)
- Distance Vector (RIP-style)
- Link State (OSPF-style)

**Design**: All routing decisions go through this interface. Devices and packets do not implement routing logic themselves.

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

### Phase 3: Packet Engine ✅ (Current)
- Packet domain model
- Packet lifecycle management
- Packet processing operations
- Packet registry

### Phase 4: Packet Lifecycle (Planned)
- Formalized state machine
- Granular state transitions
- Lifecycle validation

### Phase 5: TTL (Planned)
- Time-to-live implementation
- TTL decrement on forwarding
- TTL_EXPIRED drop reason

### Phase 6: Routing (Planned)
- BFS pathfinding
- Dijkstra algorithm
- Routing table management

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
