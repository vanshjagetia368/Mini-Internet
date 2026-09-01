/**
 * @file simulator/src/events/EventBus.test.ts
 *
 * Unit tests for the EventBus.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from './EventBus.js';
import { IdFactory } from '../types/ids.js';
import type { SimulationEvent } from '../types/events.js';

function makeDeviceCreatedEvent(): SimulationEvent {
  return {
    id: IdFactory.event(),
    type: 'DEVICE_CREATED',
    deviceId: IdFactory.device(),
    deviceName: 'Test Device',
    simulationTime: 0,
    wallClockMs: Date.now(),
  };
}

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers events to type-specific subscribers', () => {
    const received: SimulationEvent[] = [];
    bus.on('DEVICE_CREATED', (e) => received.push(e));

    const event = makeDeviceCreatedEvent();
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('DEVICE_CREATED');
  });

  it('delivers events to wildcard subscribers', () => {
    const received: SimulationEvent[] = [];
    bus.onAll((e) => received.push(e));

    bus.emit(makeDeviceCreatedEvent());

    expect(received).toHaveLength(1);
  });

  it('returns an unsubscribe function that stops delivery', () => {
    const received: SimulationEvent[] = [];
    const unsubscribe = bus.on('DEVICE_CREATED', (e) => received.push(e));

    bus.emit(makeDeviceCreatedEvent());
    expect(received).toHaveLength(1);

    unsubscribe();
    bus.emit(makeDeviceCreatedEvent());
    expect(received).toHaveLength(1); // still 1, not 2
  });

  it('clear() removes all handlers', () => {
    const received: SimulationEvent[] = [];
    bus.on('DEVICE_CREATED', (e) => received.push(e));
    bus.clear();

    bus.emit(makeDeviceCreatedEvent());
    expect(received).toHaveLength(0);
  });
});
