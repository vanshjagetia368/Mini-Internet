/**
 * @file simulator/src/simulation/SimulationEngine.ts
 *
 * The simulation engine — top-level coordinator for a running simulation.
 *
 * RESPONSIBILITIES:
 *   - Hold the authoritative NetworkGraph for the simulation
 *   - Accept commands and delegate to appropriate subsystems
 *   - Emit SimulationEvents through the EventBus
 *   - Manage simulation lifecycle (start/pause/resume/stop)
 *
 * CURRENT STATE: Foundation only.
 *   - Lifecycle state machine: implemented
 *   - Command dispatch: skeleton
 *   - Packet processing: NOT IMPLEMENTED (Phase 3+)
 *   - Routing: NOT IMPLEMENTED (Phase 3+)
 *   - Tick loop: NOT IMPLEMENTED (Phase 2+)
 *
 * INTENTIONALLY NOT IMPLEMENTED HERE:
 *   - BFS/Dijkstra/routing algorithms
 *   - Packet forwarding
 *   - Latency/loss simulation
 *   - Queue simulation
 *   - Metrics collection
 *
 * See docs/ARCHITECTURE.md for the planned implementation phases.
 */

import { NetworkGraph } from '../network/NetworkGraph.js';
import { EventBus } from '../events/EventBus.js';
import { IdFactory } from '../types/ids.js';
import type { SimulationId, DeviceId } from '../types/ids.js';
import type { SimulationConfig, SimulationStatus } from '../types/domain.js';
import type { SimulationCommand } from '../types/commands.js';
import { type Result, ok, err } from '../types/errors.js';
import type { Logger } from '../core/logger.js';
import { RoutingAlgorithmRegistry } from '../routing/RoutingAlgorithm.js';
import { DynamicRoutingService } from '../routing/DynamicRoutingService.js';
import { BfsRouter } from '../routing/BfsRouter.js';
import { PacketEngine } from '../packets/PacketEngine.js';
import type { RoutingTable } from '../routing/RoutingTable.js';

export class SimulationEngine {
  readonly id: SimulationId;
  readonly network: NetworkGraph;
  readonly eventBus: EventBus;
  readonly routing: RoutingAlgorithmRegistry;
  readonly packets: PacketEngine;
  readonly dynamicRouting: DynamicRoutingService;

  private _status: SimulationStatus = 'IDLE';
  private readonly config: SimulationConfig;
  private readonly logger: Logger;

  constructor(config: SimulationConfig, eventBus: EventBus, logger: Logger) {
    this.id = IdFactory.simulation();
    this.config = config;
    this.eventBus = eventBus;
    this.logger = logger;
    this.routing = new RoutingAlgorithmRegistry();

    this.network = new NetworkGraph(config.networkId, 'Simulation Network', this.eventBus);
    this.packets = new PacketEngine(this.network, this.eventBus);

    // Initialize dynamic routing with BFS as default algorithm
    // TODO: Make algorithm configurable via SimulationConfig in future
    this.dynamicRouting = new DynamicRoutingService(
      this.network,
      this.eventBus,
      new BfsRouter(),
      logger,
    );

    this.logger.info('SimulationEngine created', { simulationId: this.id });
  }

  get status(): SimulationStatus {
    return this._status;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): Result<void> {
    if (this._status !== 'IDLE') {
      return err('SIMULATION_STATE_ERROR', `Cannot start simulation in state ${this._status}`);
    }
    this._status = 'RUNNING';

    // Initialize dynamic routing service when simulation starts
    this.dynamicRouting.initialize();

    this.logger.info('Simulation started', { simulationId: this.id });
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'SIMULATION_STARTED',
      simulationId: this.id,
      simulationTime: 0,
      wallClockMs: Date.now(),
    });
    return ok(undefined);
  }

  /**
   * Get the routing table for a specific router.
   */
  getRoutingTable(routerId: DeviceId): RoutingTable | undefined {
    return this.dynamicRouting.getRoutingTable(routerId);
  }

  /**
   * Get all routing tables.
   */
  getAllRoutingTables(): Map<DeviceId, RoutingTable> {
    return this.dynamicRouting.getAllRoutingTables();
  }

  pause(): Result<void> {
    if (this._status !== 'RUNNING') {
      return err('SIMULATION_STATE_ERROR', `Cannot pause simulation in state ${this._status}`);
    }
    this._status = 'PAUSED';
    this.logger.info('Simulation paused', { simulationId: this.id });
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'SIMULATION_PAUSED',
      simulationId: this.id,
      simulationTime: 0,
      wallClockMs: Date.now(),
    });
    return ok(undefined);
  }

  stop(): Result<void> {
    if (this._status === 'IDLE' || this._status === 'COMPLETED') {
      return err('SIMULATION_STATE_ERROR', `Cannot stop simulation in state ${this._status}`);
    }
    this._status = 'COMPLETED';

    // Shutdown dynamic routing service
    this.dynamicRouting.shutdown();

    this.logger.info('Simulation stopped', { simulationId: this.id });
    this.eventBus.emit({
      id: IdFactory.event(),
      type: 'SIMULATION_COMPLETED',
      simulationId: this.id,
      simulationTime: 0,
      wallClockMs: Date.now(),
    });
    return ok(undefined);
  }

  // ── Command dispatch ──────────────────────────────────────────────────────

  /**
   * Dispatch a command to the appropriate subsystem.
   *
   * IMPORTANT: Commands are validated and delegated here. The network graph
   * and routing subsystem are the domain objects that execute the logic.
   * This method is the command handler, not a business logic owner.
   *
   * PLACEHOLDER: Packet-related commands are acknowledged but not executed yet.
   */
  dispatch(command: SimulationCommand): Result<void> {
    this.logger.debug('Dispatching command', { type: command.type });

    switch (command.type) {
      case 'CREATE_DEVICE': {
        const result = this.network.addDevice(command.name, command.deviceType);
        return result.ok ? ok(undefined) : result;
      }

      case 'REMOVE_DEVICE': {
        return this.network.removeDevice(command.deviceId);
      }

      case 'UPDATE_DEVICE': {
        // TODO Phase 2: implement device property updates
        return err('INVALID_COMMAND', 'UPDATE_DEVICE not yet implemented');
      }

      case 'CREATE_LINK': {
        const options: {
          bandwidthBps?: number;
          delayMs?: number;
          lossRate?: number;
          cost?: number;
        } = {};
        if (command.bandwidthBps !== undefined) options.bandwidthBps = command.bandwidthBps;
        if (command.delayMs !== undefined) options.delayMs = command.delayMs;
        if (command.lossRate !== undefined) options.lossRate = command.lossRate;
        if (command.cost !== undefined) options.cost = command.cost;
        const result = this.network.addLink(command.endpointA, command.endpointB, options);
        return result.ok ? ok(undefined) : result;
      }

      case 'REMOVE_LINK': {
        return this.network.removeLink(command.linkId);
      }

      case 'FAIL_NODE': {
        return this.network.failDevice(command.deviceId);
      }

      case 'RECOVER_NODE': {
        return this.network.recoverDevice(command.deviceId);
      }

      case 'FAIL_LINK': {
        return this.network.failLink(command.linkId);
      }

      case 'RECOVER_LINK': {
        return this.network.recoverLink(command.linkId);
      }

      case 'START_SIMULATION': {
        return this.start();
      }

      case 'PAUSE_SIMULATION': {
        return this.pause();
      }

      case 'STOP_SIMULATION': {
        return this.stop();
      }

      case 'SET_INTERFACE_IP':
        // TODO Phase 2: IP configuration
        return err('INVALID_COMMAND', 'SET_INTERFACE_IP not yet implemented');

      case 'SEND_PACKET': {
        const createResult = this.packets.createPacket({
          sourceDeviceId: command.sourceDeviceId,
          destinationDeviceId: command.destinationDeviceId,
          sourceIp: command.sourceIp,
          destinationIp: command.destinationIp,
          payload: command.payload,
        });
        if (!createResult.ok) return createResult;

        const sendResult = this.packets.sendPacket(createResult.value.id);
        return sendResult.ok ? ok(undefined) : sendResult;
      }

      case 'RESUME_SIMULATION':
        // TODO Phase 2
        return err('INVALID_COMMAND', 'RESUME_SIMULATION not yet implemented');

      case 'UPDATE_LINK':
        // TODO Phase 2
        return err('INVALID_COMMAND', 'UPDATE_LINK not yet implemented');

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = command;
        void _exhaustive;
        return err('INVALID_COMMAND', `Unknown command type`);
      }
    }
  }
}
