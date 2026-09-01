/**
 * @file server/src/api/healthRouter.ts
 *
 * Health check endpoint — useful for Docker, load balancers, and CI checks.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'mini-internet-server',
    timestamp: new Date().toISOString(),
  });
});
