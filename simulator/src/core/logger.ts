/**
 * @file simulator/src/core/logger.ts
 *
 * Minimal structured logger for the simulator domain.
 *
 * RULE: Never use console.log() directly in domain code.
 *       Always use this logger so output can be controlled/redirected.
 *
 * CURRENT STATE: Console-based implementation for development.
 * FUTURE: Replace with structured JSON logger (e.g., pino) when the server
 * needs to aggregate simulator logs with server logs.
 *
 * Log levels:
 *   DEBUG   - verbose development info (disabled in production)
 *   INFO    - normal operational messages
 *   WARN    - unexpected but recoverable situations
 *   ERROR   - error conditions that need attention
 *   SILENT  - suppress all output (used in tests)
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';

const LEVEL_RANK: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
};

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export class ConsoleLogger implements Logger {
  constructor(
    private readonly namespace: string,
    private readonly minLevel: LogLevel = 'INFO',
  ) {}

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      namespace: this.namespace,
      message,
      ...(context ? { context } : {}),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'DEBUG':
      case 'INFO':
        console.log(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      case 'ERROR':
        console.error(output);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('DEBUG', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('WARN', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('ERROR', message, context);
  }
}

/** A no-op logger for use in tests where output should be suppressed. */
export class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Create a namespaced logger instance.
 * Pass this into simulator components rather than using a global.
 */
export function createLogger(namespace: string, level: LogLevel = 'INFO'): Logger {
  return new ConsoleLogger(namespace, level);
}
