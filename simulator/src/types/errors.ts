/**
 * @file simulator/src/types/errors.ts
 *
 * Typed error hierarchy for the simulation engine.
 *
 * RULE: Never use generic `Error` across domain boundaries.
 * Errors must be machine-readable so the server can serialize them and the
 * client can display meaningful feedback.
 *
 * RULE: Do not silently swallow errors. Every domain operation that can fail
 * must return or throw a typed SimulatorError.
 */

// ─── Error Codes ─────────────────────────────────────────────────────────────

export type SimulatorErrorCode =
  | 'INVALID_COMMAND'
  | 'ENTITY_NOT_FOUND'
  | 'DUPLICATE_ENTITY'
  | 'DUPLICATE_INTERFACE'
  | 'INVALID_TOPOLOGY'
  | 'INVALID_ENDPOINT'
  | 'INVALID_IP_CONFIG'
  | 'INVALID_MAC_ADDRESS'
  | 'INVALID_IPV4_ADDRESS'
  | 'INVALID_PREFIX_LENGTH'
  | 'INVALID_CIDR'
  | 'INVALID_SUBNET_MASK'
  | 'INVALID_HOST_ADDRESS'
  | 'ENTITY_UNAVAILABLE'
  | 'INVALID_ROUTE'
  | 'PACKET_DROPPED'
  | 'SIMULATION_STATE_ERROR'
  | 'TTL_EXPIRED'
  | 'INTERNAL_ERROR';

// ─── Error Class ──────────────────────────────────────────────────────────────

/**
 * All domain errors extend SimulatorError.
 * The `code` field makes errors identifiable without instanceof checks.
 */
export class SimulatorError extends Error {
  constructor(
    public readonly code: SimulatorErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SimulatorError';

    // Maintain proper prototype chain in transpiled code
    Object.setPrototypeOf(this, SimulatorError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context ?? null,
    };
  }
}

// ─── Result Type ─────────────────────────────────────────────────────────────

/**
 * A Result<T> avoids throwing exceptions across module boundaries.
 * Use Result for operations that can predictably fail (validation, routing).
 * Reserve thrown errors for truly unexpected/internal failures.
 */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: SimulatorError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(
  code: SimulatorErrorCode,
  message: string,
  context?: Record<string, unknown>,
): Result<never> {
  return { ok: false, error: new SimulatorError(code, message, context) };
}
