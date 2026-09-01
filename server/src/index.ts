/**
 * @file server/src/index.ts
 *
 * Server entry point.
 *
 * RESPONSIBILITIES OF THE SERVER:
 *   - HTTP API (Express)
 *   - Real-time communication (WebSocket — Phase 2)
 *   - Application-level orchestration
 *   - Receives commands from clients
 *   - Invokes simulator functionality
 *   - Broadcasts simulator events (Phase 2)
 *   - Later: persistence integration
 *
 * CURRENT STATE — Foundation phase:
 *   - Express server with health endpoint ✓
 *   - Simulator is instantiated ✓
 *   - WebSocket integration: NOT YET (Phase 2)
 *   - Command routing: NOT YET (Phase 2)
 *   - Persistence: NOT YET (Phase 3+)
 */

import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { healthRouter } from './api/healthRouter.js';
import {
  EventBus,
  SimulationEngine,
  IdFactory,
  createLogger,
} from '@mini-internet/simulator';

const logger = createLogger('server', config.isDevelopment ? 'DEBUG' : 'INFO');

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', healthRouter);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Simulator bootstrap ───────────────────────────────────────────────────────

const eventBus = new EventBus();
const simulatorLogger = createLogger('simulator', 'DEBUG');

// Subscribe the server to ALL simulator events for eventual WebSocket broadcast.
// Currently we just log them; Phase 2 adds WebSocket broadcasting here.
eventBus.onAll((event) => {
  logger.debug('Simulator event received', { type: event.type, id: event.id });
});

const engine = new SimulationEngine(
  {
    networkId: IdFactory.network(),
    tickMs: 100,
    seed: 42,
  },
  eventBus,
  simulatorLogger,
);

logger.info('Simulation engine initialized', { engineId: engine.id });

// ── HTTP server ───────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  logger.info(`Server listening`, { port: config.port, env: config.nodeEnv });
});

export { app, engine, eventBus };
