/**
 * @file simulator/src/events/EventBus.ts
 *
 * A minimal, typed event bus for the simulation engine.
 *
 * ARCHITECTURAL PURPOSE:
 *   The simulator emits events rather than returning mutation results.
 *   The server layer subscribes to this bus and broadcasts events via WebSocket.
 *   The persistence layer subscribes and stores events.
 *   Tests subscribe and assert on emitted events.
 *
 * This decouples the simulator from all consumers — the simulator does not
 * need to know about WebSocket, HTTP responses, or databases.
 *
 * DESIGN: Simple observer pattern. No external dependencies.
 *
 * CURRENT STATE: Implemented — ready for use by the simulator core in Phase 2.
 */

import type { SimulationEvent, SimulationEventType } from '../types/events.js';

type EventHandler<T extends SimulationEvent> = (event: T) => void;

/**
 * A typed event bus for simulation events.
 *
 * Usage:
 *   const bus = new EventBus();
 *   bus.on('DEVICE_CREATED', (e) => console.log(e.deviceId));
 *   bus.emit({ type: 'DEVICE_CREATED', ... });
 */
export class EventBus {
  // Map from event type → set of handlers
  private readonly handlers = new Map<SimulationEventType, Set<EventHandler<SimulationEvent>>>();

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function for cleanup.
   */
  on<T extends SimulationEvent>(
    type: T['type'],
    handler: EventHandler<T>,
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    // Cast is safe: handler is registered only for its specific type T
    const set = this.handlers.get(type)!;
    set.add(handler as EventHandler<SimulationEvent>);

    return () => {
      set.delete(handler as EventHandler<SimulationEvent>);
    };
  }

  /**
   * Subscribe to ALL events regardless of type.
   * Useful for logging, persistence, and WebSocket broadcasting.
   */
  onAll(handler: EventHandler<SimulationEvent>): () => void {
    this._wildcardHandlers.add(handler);
    return () => { this._wildcardHandlers.delete(handler); };
  }

  private readonly _wildcardHandlers = new Set<EventHandler<SimulationEvent>>();

  /**
   * Emit an event to all subscribers.
   * Called by the simulator core — NOT by the server or client.
   */
  emit(event: SimulationEvent): void {
    // Dispatch to type-specific handlers
    const typed = this.handlers.get(event.type);
    if (typed) {
      for (const handler of typed) {
        handler(event);
      }
    }
    // Dispatch to wildcard handlers
    for (const handler of this._wildcardHandlers) {
      handler(event);
    }
  }

  /** Remove all handlers (useful between test cases). */
  clear(): void {
    this.handlers.clear();
    this._wildcardHandlers.clear();
  }
}
