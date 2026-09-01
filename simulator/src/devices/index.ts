/**
 * @file simulator/src/devices/index.ts
 *
 * Public exports for the device module.
 *
 * The DeviceFactory is the recommended entry point for creating devices.
 * It validates inputs and returns typed creation results including
 * the IDs of automatically created default interfaces.
 *
 * All authoritative device state lives in NetworkGraph.
 * DeviceFactory is a stateless facade that delegates mutations to it.
 */

export { DeviceFactory } from './DeviceFactory.js';
export type {
  DeviceCreationOptions,
  PcCreationOptions,
  RouterCreationOptions,
  ServerCreationOptions,
  PcOrServerCreationResult,
  RouterCreationResult,
} from './DeviceFactory.js';
