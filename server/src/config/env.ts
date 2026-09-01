/**
 * @file server/src/config/env.ts
 *
 * Server configuration loaded from environment variables.
 *
 * RULE: All env-var access is centralized here.
 *       No other file should read process.env directly.
 *       This makes configuration testable and explicit.
 */

import 'dotenv/config';

export function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env['SERVER_PORT'] ?? '3001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  isDevelopment: (process.env['NODE_ENV'] ?? 'development') === 'development',
  isTest: process.env['NODE_ENV'] === 'test',
} as const;
