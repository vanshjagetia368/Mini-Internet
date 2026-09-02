import { describe, it, expect } from 'vitest';
import type { DeviceId, PacketId } from '../types/ids.js';
import { PacketFactory } from './Packet.js';
import type { Packet } from './Packet.js';
import type { PacketState, PacketLifecycleTransition } from './PacketStateMachine.js';
import {
  PACKET_STATES,
  TERMINAL_PACKET_STATES,
  ALLOWED_PACKET_TRANSITIONS,
  isTerminalPacketState,
  isValidPacketTransition,
  transitionPacket,
  hasReachedState,
} from './PacketStateMachine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePacket(overrides: Partial<Packet> = {}, idSeed: number = 1): Packet {
  const base = PacketFactory.create(
    {
      sourceDeviceId: 'dev-src' as DeviceId,
      destinationDeviceId: 'dev-dst' as DeviceId,
      sourceIp: '10.0.0.1',
      destinationIp: '10.0.0.2',
      payload: 'hello',
    },
    () => `pkt_test_${idSeed}` as PacketId,
  );
  return { ...base, ...overrides } as Packet;
}

function applyChain(initial: Packet, chain: Array<[PacketState, string, DeviceId | null]>): Packet {
  let p = initial;
  for (const [next, reason, at] of chain) {
    const r = transitionPacket(p, next, { reason: reason as any, atDeviceId: at ?? undefined });
    if (!r.ok) throw new Error(`Chain step failed ${p.state}→${next}: ${r.error.message}`);
    p = r.value;
  }
  return p;
}

function toDelivered(p: Packet): Packet {
  const chain: Array<[PacketState, string, DeviceId | null]> = [];
  if (p.state === 'CREATED') {
    chain.push(['QUEUED', 'send', p.sourceDeviceId]);
  }
  if (p.state === 'CREATED' || p.state === 'QUEUED') {
    chain.push(['FORWARDED', 'forward', 'dev-r1' as DeviceId]);
  }
  chain.push(['FORWARDED', 'forward', 'dev-r2' as DeviceId]);
  chain.push(['DELIVERED', 'destination_reached', p.destinationDeviceId]);
  return applyChain(p, chain);
}

function toDroppedQueued(p: Packet): Packet {
  const chain: Array<[PacketState, string, DeviceId | null]> = [];
  if (p.state === 'CREATED') {
    chain.push(['QUEUED', 'send', p.sourceDeviceId]);
  }
  chain.push(['DROPPED', 'invalid_route', p.sourceDeviceId]);
  return applyChain(p, chain);
}

// ─── Structural / Constants ───────────────────────────────────────────────────

describe('PacketStateMachine — structural constants', () => {
  it('PACKET_STATES has exactly the 5 roadmap states in order', () => {
    expect([...PACKET_STATES]).toEqual(['CREATED', 'QUEUED', 'FORWARDED', 'DELIVERED', 'DROPPED']);
  });

  it('TERMINAL_PACKET_STATES contains only DELIVERED and DROPPED', () => {
    expect(TERMINAL_PACKET_STATES.has('DELIVERED')).toBe(true);
    expect(TERMINAL_PACKET_STATES.has('DROPPED')).toBe(true);
    expect(TERMINAL_PACKET_STATES.size).toBe(2);
    expect(TERMINAL_PACKET_STATES.has('CREATED')).toBe(false);
    expect(TERMINAL_PACKET_STATES.has('QUEUED')).toBe(false);
    expect(TERMINAL_PACKET_STATES.has('FORWARDED')).toBe(false);
  });

  it('isTerminalPacketState reports true for terminal states only', () => {
    expect(isTerminalPacketState('DELIVERED')).toBe(true);
    expect(isTerminalPacketState('DROPPED')).toBe(true);
    expect(isTerminalPacketState('CREATED')).toBe(false);
    expect(isTerminalPacketState('QUEUED')).toBe(false);
    expect(isTerminalPacketState('FORWARDED')).toBe(false);
  });

  it('ALLOWED_PACKET_TRANSITIONS matches the specification exactly', () => {
    expect([...ALLOWED_PACKET_TRANSITIONS.CREATED]).toEqual(['QUEUED']);
    expect([...ALLOWED_PACKET_TRANSITIONS.QUEUED].sort()).toEqual(['DROPPED', 'FORWARDED'].sort());
    expect([...ALLOWED_PACKET_TRANSITIONS.FORWARDED].sort()).toEqual(
      ['DROPPED', 'DELIVERED', 'FORWARDED'].sort(),
    );
    expect([...ALLOWED_PACKET_TRANSITIONS.DELIVERED]).toEqual([]);
    expect([...ALLOWED_PACKET_TRANSITIONS.DROPPED]).toEqual([]);
  });
});

// ─── Valid Transition Tests (§35) ────────────────────────────────────────────

describe('PacketStateMachine — valid transitions (§35)', () => {
  it('CREATED → QUEUED works via transitionPacket', () => {
    const p = makePacket();
    const r = transitionPacket(p, 'QUEUED', { reason: 'send' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('QUEUED');
      expect(r.value.lifecycleHistory).toHaveLength(1);
      expect(r.value.lifecycleHistory[0]).toMatchObject({
        from: 'CREATED',
        to: 'QUEUED',
        reason: 'send',
        ordinal: 1,
      });
    }
  });

  it('QUEUED → FORWARDED works (first hop)', () => {
    const p0 = makePacket();
    const p1 = applyChain(p0, [['QUEUED', 'send', null]]);
    const r = transitionPacket(p1, 'FORWARDED', {
      reason: 'forward',
      atDeviceId: 'dev-r1' as DeviceId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('FORWARDED');
      expect(r.value.lifecycleHistory).toHaveLength(2);
      expect(r.value.lifecycleHistory[1]).toMatchObject({
        from: 'QUEUED',
        to: 'FORWARDED',
        ordinal: 2,
        reason: 'forward',
        atDeviceId: 'dev-r1',
      });
    }
  });

  it('FORWARDED → FORWARDED works (multi-hop) with monotonic ordinals', () => {
    const p0 = makePacket();
    const p1 = applyChain(p0, [
      ['QUEUED', 'send', null],
      ['FORWARDED', 'forward', 'dev-r1' as DeviceId],
    ]);
    const r = transitionPacket(p1, 'FORWARDED', {
      reason: 'forward',
      atDeviceId: 'dev-r2' as DeviceId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('FORWARDED');
      const ords = r.value.lifecycleHistory.map((e) => e.ordinal);
      expect(ords).toEqual([1, 2, 3]);
    }
  });

  it('FORWARDED → DELIVERED works at destination', () => {
    const p0 = makePacket();
    const p = applyChain(p0, [
      ['QUEUED', 'send', p0.sourceDeviceId],
      ['FORWARDED', 'forward', 'dev-r1' as DeviceId],
    ]);
    const r = transitionPacket(p, 'DELIVERED', {
      reason: 'destination_reached',
      atDeviceId: p0.destinationDeviceId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('DELIVERED');
      const last = r.value.lifecycleHistory[r.value.lifecycleHistory.length - 1];
      expect(last).toMatchObject({
        from: 'FORWARDED',
        to: 'DELIVERED',
        reason: 'destination_reached',
      });
    }
  });

  it('QUEUED → DROPPED works with structured reason', () => {
    const p0 = makePacket();
    const p1 = applyChain(p0, [['QUEUED', 'send', null]]);
    const r = transitionPacket(p1, 'DROPPED', {
      reason: 'invalid_route',
      atDeviceId: p0.sourceDeviceId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('DROPPED');
      const last = r.value.lifecycleHistory[r.value.lifecycleHistory.length - 1];
      expect(last.reason).toBe('invalid_route');
      expect(last.atDeviceId).toBe(p0.sourceDeviceId);
    }
  });

  it('FORWARDED → DROPPED works mid-hop', () => {
    const p0 = makePacket();
    const p = applyChain(p0, [
      ['QUEUED', 'send', null],
      ['FORWARDED', 'forward', 'dev-r1' as DeviceId],
    ]);
    const r = transitionPacket(p, 'DROPPED', {
      reason: 'unreachable',
      atDeviceId: 'dev-r1' as DeviceId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('DROPPED');
    }
  });
});

// ─── Invalid Transition Tests (§36) ───────────────────────────────────────────

describe('PacketStateMachine — invalid transitions (§36)', () => {
  const allStates: PacketState[] = ['CREATED', 'QUEUED', 'FORWARDED', 'DELIVERED', 'DROPPED'];

  it('rejects every combination not in ALLOWED_PACKET_TRANSITIONS via isValidPacketTransition', () => {
    for (const cur of allStates) {
      for (const next of allStates) {
        const expected = ALLOWED_PACKET_TRANSITIONS[cur].has(next);
        expect(isValidPacketTransition(cur, next)).withContext(`${cur} → ${next}`).toBe(expected);
      }
    }
  });

  it('CREATED → DELIVERED is invalid', () => {
    const p = makePacket();
    const r = transitionPacket(p, 'DELIVERED', { reason: 'destination_reached' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SIMULATION_STATE_ERROR');
  });

  it('CREATED → FORWARDED is invalid', () => {
    const p = makePacket();
    const r = transitionPacket(p, 'FORWARDED', { reason: 'forward' });
    expect(r.ok).toBe(false);
  });

  it('CREATED → DROPPED is invalid (must go through QUEUED first)', () => {
    const p = makePacket();
    const r = transitionPacket(p, 'DROPPED', { reason: 'invalid_route' });
    expect(r.ok).toBe(false);
  });

  it('FORWARDED → QUEUED is invalid (backward)', () => {
    const p0 = makePacket();
    const p = applyChain(p0, [
      ['QUEUED', 'send', null],
      ['FORWARDED', 'forward', null],
    ]);
    const r = transitionPacket(p, 'QUEUED', { reason: 'send' });
    expect(r.ok).toBe(false);
  });

  it('QUEUED → CREATED is invalid (backward)', () => {
    const p0 = makePacket();
    const p = applyChain(p0, [['QUEUED', 'send', null]]);
    const r = transitionPacket(p, 'CREATED', { reason: 'other' });
    expect(r.ok).toBe(false);
  });

  it('FORWARDED → CREATED is invalid (backward)', () => {
    const p0 = makePacket();
    const p = applyChain(p0, [
      ['QUEUED', 'send', null],
      ['FORWARDED', 'forward', null],
    ]);
    const r = transitionPacket(p, 'CREATED', { reason: 'other' });
    expect(r.ok).toBe(false);
  });
});

// ─── Terminal State Immutability (§37) ────────────────────────────────────────

describe('PacketStateMachine — terminal immutability (§37)', () => {
  const allStates: PacketState[] = ['CREATED', 'QUEUED', 'FORWARDED', 'DELIVERED', 'DROPPED'];

  it('DELIVERED packet: attempt every transition — all must fail', () => {
    const p0 = makePacket({}, 10);
    const delivered = toDelivered(p0);
    expect(delivered.state).toBe('DELIVERED');
    let failures = 0;
    for (const next of allStates) {
      const r = transitionPacket(delivered, next, { reason: 'other' });
      if (!r.ok) failures++;
    }
    expect(failures).toBe(allStates.length);
  });

  it('DROPPED packet: attempt every transition — all must fail', () => {
    const p0 = makePacket({}, 11);
    const dropped = toDroppedQueued(p0);
    expect(dropped.state).toBe('DROPPED');
    let failures = 0;
    for (const next of allStates) {
      const r = transitionPacket(dropped, next, { reason: 'other' });
      if (!r.ok) failures++;
    }
    expect(failures).toBe(allStates.length);
  });

  it('DELIVERED → FORWARDED is rejected (§14)', () => {
    const p = toDelivered(makePacket({}, 12));
    const r = transitionPacket(p, 'FORWARDED', { reason: 'forward' });
    expect(r.ok).toBe(false);
  });

  it('DELIVERED → DROPPED is rejected (§15)', () => {
    const p = toDelivered(makePacket({}, 13));
    const r = transitionPacket(p, 'DROPPED', { reason: 'other' });
    expect(r.ok).toBe(false);
  });

  it('DELIVERED → QUEUED is rejected (§13)', () => {
    const p = toDelivered(makePacket({}, 14));
    const r = transitionPacket(p, 'QUEUED', { reason: 'send' });
    expect(r.ok).toBe(false);
  });

  it('DROPPED → FORWARDED is rejected (§16)', () => {
    const p = toDroppedQueued(makePacket({}, 15));
    const r = transitionPacket(p, 'FORWARDED', { reason: 'forward' });
    expect(r.ok).toBe(false);
  });

  it('DROPPED → DELIVERED is rejected (§18)', () => {
    const p = toDroppedQueued(makePacket({}, 16));
    const r = transitionPacket(p, 'DELIVERED', { reason: 'destination_reached' });
    expect(r.ok).toBe(false);
  });
});

// ─── Multi-hop Lifecycle (§38) ────────────────────────────────────────────────

describe('PacketStateMachine — multi-hop lifecycle (§38)', () => {
  it('full lifecycle CREATED→QUEUED→F→F→F→DELIVERED records correct history and ordinals', () => {
    const p0 = makePacket({}, 20);
    const steps: Array<[PacketState, string, DeviceId | null]> = [
      ['QUEUED', 'send', 'PC1' as DeviceId],
      ['FORWARDED', 'forward', 'R1' as DeviceId],
      ['FORWARDED', 'forward', 'R2' as DeviceId],
      ['FORWARDED', 'forward', 'Server' as DeviceId],
      ['DELIVERED', 'destination_reached', 'Server' as DeviceId],
    ];
    const p = applyChain(p0, steps);

    expect(p.state).toBe('DELIVERED');
    expect(p.currentLocation).toBe(p0.sourceDeviceId); // SM doesn't move location
    expect(p.lifecycleHistory).toHaveLength(steps.length);
    expect(p.lifecycleHistory.map((e) => e.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(p.lifecycleHistory.map((e) => `${e.from}→${e.to}`)).toEqual([
      'CREATED→QUEUED',
      'QUEUED→FORWARDED',
      'FORWARDED→FORWARDED',
      'FORWARDED→FORWARDED',
      'FORWARDED→DELIVERED',
    ]);
  });

  it('state stays FORWARDED across repeated FORWARDED→FORWARDED hops', () => {
    const p0 = makePacket({}, 21);
    let p = applyChain(p0, [['QUEUED', 'send', null]]);
    for (let i = 0; i < 5; i++) {
      const r = transitionPacket(p, 'FORWARDED', { reason: 'forward' });
      expect(r.ok).toBe(true);
      if (r.ok) p = r.value;
      expect(p.state).toBe('FORWARDED');
    }
    expect(p.lifecycleHistory).toHaveLength(6); // 1 QUEUED + 5 FORWARDED
  });
});

// ─── Multiple Packets Independence (§39) ──────────────────────────────────────

describe('PacketStateMachine — multiple packets (§39)', () => {
  it('P1 transition state does not affect P2', () => {
    const p1 = makePacket({}, 30);
    const p2 = makePacket({}, 31);

    const r1 = transitionPacket(p1, 'QUEUED', { reason: 'send' });
    expect(r1.ok).toBe(true);

    // p2 untouched
    expect(p2.state).toBe('CREATED');
    expect(p2.lifecycleHistory).toHaveLength(0);

    if (r1.ok) {
      expect(r1.value.state).toBe('QUEUED');
    }

    // p1 delivered independently of p2
    const p1Final = toDelivered(r1.ok ? r1.value : p1);
    expect(p1Final.state).toBe('DELIVERED');
    expect(p2.state).toBe('CREATED');
  });

  it('packet IDs remain distinct and stable through independent lifecycles', () => {
    const p1 = makePacket({}, 40);
    const p2 = makePacket({}, 41);
    const p3 = makePacket({}, 42);

    expect(p1.id).not.toBe(p2.id);
    expect(p2.id).not.toBe(p3.id);

    const end1 = toDelivered(p1);
    const end2 = toDroppedQueued(p2);
    const end3 = applyChain(p3, [['QUEUED', 'send', null]]);

    expect(end1.id).toBe(p1.id);
    expect(end2.id).toBe(p2.id);
    expect(end3.id).toBe(p3.id);

    expect(end1.state).toBe('DELIVERED');
    expect(end2.state).toBe('DROPPED');
    expect(end3.state).toBe('QUEUED');
  });
});

// ─── Drop Preservation (§40) ──────────────────────────────────────────────────

describe('PacketStateMachine — drop preservation (§40)', () => {
  it('after drop: id, source, dest, payload, location, history preserved', () => {
    const p0 = makePacket({}, 50);
    const forwarded = applyChain(p0, [
      ['QUEUED', 'send', null],
      ['FORWARDED', 'forward', 'dev-r1' as DeviceId],
      ['FORWARDED', 'forward', 'dev-r2' as DeviceId],
    ]);
    const drop = transitionPacket(forwarded, 'DROPPED', { reason: 'ttl_expired' });
    expect(drop.ok).toBe(true);
    if (!drop.ok) return;

    const d = drop.value;
    expect(d.id).toBe(p0.id);
    expect(d.sourceDeviceId).toBe(p0.sourceDeviceId);
    expect(d.destinationDeviceId).toBe(p0.destinationDeviceId);
    expect(d.sourceIp).toBe(p0.sourceIp);
    expect(d.destinationIp).toBe(p0.destinationIp);
    expect(d.payload).toBe(p0.payload);
    expect(d.currentLocation).toBe(p0.currentLocation); // SM does not mutate location
    expect(d.history).toEqual(p0.history); // SM does not mutate location history
    const lastEntry = d.lifecycleHistory[d.lifecycleHistory.length - 1];
    expect(lastEntry.to).toBe('DROPPED');
    expect(lastEntry.reason).toBe('ttl_expired');
  });
});

// ─── Serialization & Rehydration (§41 / §42) ──────────────────────────────────

describe('PacketStateMachine — serialization & rehydration (§41 §42)', () => {
  it('JSON roundtrip preserves state in all 5 major states', () => {
    const states: PacketState[] = ['CREATED', 'QUEUED', 'FORWARDED', 'DELIVERED', 'DROPPED'];
    for (const s of states) {
      let p: Packet = makePacket({ id: `pkt_${s}` as PacketId }, 60);
      if (s !== 'CREATED') {
        if (s === 'QUEUED') p = applyChain(p, [['QUEUED', 'send', null]]);
        if (s === 'FORWARDED')
          p = applyChain(p, [
            ['QUEUED', 'send', null],
            ['FORWARDED', 'forward', null],
          ]);
        if (s === 'DELIVERED') p = toDelivered(p);
        if (s === 'DROPPED') p = toDroppedQueued(p);
      }
      expect(p.state).toBe(s);

      const serialized = JSON.parse(JSON.stringify(p)) as Packet;
      expect(serialized.state).toBe(s);
      expect(serialized.lifecycleHistory.length).toBe(p.lifecycleHistory.length);

      if (serialized.lifecycleHistory.length > 0) {
        const entries: PacketLifecycleTransition[] = serialized.lifecycleHistory;
        expect(entries[entries.length - 1].to).toBe(s);
      }
    }
  });

  it('hasReachedState works correctly on rehydrated packet', () => {
    const p0 = makePacket({}, 61);
    const delivered = toDelivered(p0);
    const rehydrated: Packet = JSON.parse(JSON.stringify(delivered));

    expect(hasReachedState(rehydrated, 'CREATED')).toBe(true); // initial state
    expect(hasReachedState(rehydrated, 'QUEUED')).toBe(true);
    expect(hasReachedState(rehydrated, 'FORWARDED')).toBe(true);
    expect(hasReachedState(rehydrated, 'DELIVERED')).toBe(true);
    expect(hasReachedState(rehydrated, 'DROPPED')).toBe(false);
  });
});

// ─── Immutability / Cloning ───────────────────────────────────────────────────

describe('PacketStateMachine — immutability guarantees', () => {
  it('transitionPacket returns a clone; input is not mutated', () => {
    const p = makePacket({}, 70);
    const beforeHistory = p.lifecycleHistory.length;
    const beforeState = p.state;

    const r = transitionPacket(p, 'QUEUED', { reason: 'send' });
    expect(r.ok).toBe(true);

    expect(p.state).toBe(beforeState);
    expect(p.lifecycleHistory.length).toBe(beforeHistory);

    if (r.ok) {
      expect(r.value.state).toBe('QUEUED');
      expect(r.value.lifecycleHistory.length).toBe(beforeHistory + 1);
      expect(r.value).not.toBe(p);
    }
  });

  it('identity fields are never mutated by transitionPacket (§32)', () => {
    const p0 = makePacket({}, 71);
    const p = toDelivered(p0);
    expect(p.id).toBe(p0.id);
    expect(p.sourceDeviceId).toBe(p0.sourceDeviceId);
    expect(p.destinationDeviceId).toBe(p0.destinationDeviceId);
    expect(p.sourceIp).toBe(p0.sourceIp);
    expect(p.destinationIp).toBe(p0.destinationIp);
    expect(p.payload).toBe(p0.payload);
    expect(p.createdAt).toBe(p0.createdAt);
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe('PacketStateMachine — transition metadata (§23, §24, §26)', () => {
  it('transition records atDeviceId from option, falling back to current location', () => {
    const p0 = makePacket({ currentLocation: 'dev-r1' as DeviceId }, 80);
    const q = transitionPacket(p0, 'QUEUED', { reason: 'send' });
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.value.lifecycleHistory[0].atDeviceId).toBe('dev-r1');

    const p1 = makePacket({ currentLocation: 'dev-x' as DeviceId }, 81);
    const q2 = transitionPacket(p1, 'QUEUED', { reason: 'send', atDeviceId: 'dev-y' as DeviceId });
    expect(q2.ok).toBe(true);
    if (q2.ok) expect(q2.value.lifecycleHistory[0].atDeviceId).toBe('dev-y');
  });
});
