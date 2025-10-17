// ────────────────────────── MCP Routes ──────────────────────────

import { Router } from 'express';
import { handleMcpRequest } from '../services/mcpService.js';
import { log } from '../middleware/logging.js';

const router = Router();

// MCP JSON-RPC endpoint
router.post("/mcp", async (req, res) => {
  try {
    await handleMcpRequest(req, res);
  } catch (err: any) {
    log.error("MCP JSON-RPC error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
