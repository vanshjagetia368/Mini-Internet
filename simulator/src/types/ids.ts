/**
 * @file simulator/src/types/ids.ts
 *
 * Branded ID types for every simulation entity.
 *
 * Using branded/nominal types prevents accidentally passing a DeviceId where
 * a LinkId is expected. All entity IDs are stable, opaque strings generated
 * by the domain — NOT array indices, NOT React Flow internal IDs.
 */

/** Generic branded string type helper */
type Brand<Base, Tag extends string> = Base & { readonly __brand: Tag };

// ─── Entity ID Types ──────────────────────────────────────────────────────────

export type NetworkId = Brand<string, 'NetworkId'>;
export type DeviceId = Brand<string, 'DeviceId'>;
export type InterfaceId = Brand<string, 'InterfaceId'>;
export type LinkId = Brand<string, 'LinkId'>;
export type PacketId = Brand<string, 'PacketId'>;
export type SimulationId = Brand<string, 'SimulationId'>;
export type EventId = Brand<string, 'EventId'>;

// ─── ID Factory ───────────────────────────────────────────────────────────────

/**
 * Creates a branded entity ID from a raw string.
 * All ID creation should go through this factory so we have one place to
 * swap the generation strategy (e.g., UUID v4, nanoid, etc.).
 *
 * IMPORTANT: Do not generate IDs inside React components. IDs must originate
 * from the domain layer so they remain stable across re-renders.
 */
function createId<T extends Brand<string, string>>(prefix: string): T {
  // Simple timestamp + random suffix; replace with uuid/nanoid when desired.
  const random = Math.random().toString(36).slice(2, 9);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${random}` as T;
}

export const IdFactory = {
  network: (): NetworkId => createId<NetworkId>('net'),
  device: (): DeviceId => createId<DeviceId>('dev'),
  interface: (): InterfaceId => createId<InterfaceId>('iface'),
  link: (): LinkId => createId<LinkId>('link'),
  packet: (): PacketId => createId<PacketId>('pkt'),
  simulation: (): SimulationId => createId<SimulationId>('sim'),
  event: (): EventId => createId<EventId>('evt'),
} as const;
