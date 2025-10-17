// ────────────────────────── Route Aggregator ──────────────────────────

import { Router } from 'express';
import restRoutes from './rest.js';
import frontendRoutes from './frontend.js';
import mcpRoutes from './mcp.js';

const router = Router();

// Mount all route modules
router.use('/', restRoutes);
router.use('/', frontendRoutes);
router.use('/', mcpRoutes);

export default router;
