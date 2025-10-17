// ────────────────────────── REST API Routes ──────────────────────────

import { Router } from 'express';
import { startTimer, controlTimer, getTimerStatus } from '../services/timerService.js';
import { log } from '../middleware/logging.js';

const router = Router();

// REST API endpoints (MCP-compatible)
router.post("/tools/startTimer", async (req, res) => {
  try {
    const { name = "Timer", durationSeconds } = req.body;
    
    if (!durationSeconds || typeof durationSeconds !== "number") {
      return res.status(400).json({
        error: "durationSeconds parameter is required and must be a number",
        example: { name: "Coffee Break", durationSeconds: 300 },
      });
    }

    const response = await startTimer(name, durationSeconds);
    res.json(response);
  } catch (err: any) {
    log.error("REST API error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/tools/controlTimer", async (req, res) => {
  try {
    const { timerId, action } = req.body;
    
    if (!timerId || !action) {
      return res.status(400).json({
        error: "timerId and action parameters are required",
        example: { timerId: "timer_123", action: "pause" },
      });
    }

    const response = await controlTimer(timerId, action);
    res.json(response);
  } catch (err: any) {
    log.error("REST API error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/tools/getTimerStatus", async (req, res) => {
  try {
    const response = await getTimerStatus();
    res.json(response);
  } catch (err: any) {
    log.error("REST API error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
