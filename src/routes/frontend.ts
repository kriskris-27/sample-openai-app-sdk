// ────────────────────────── Frontend Sync Routes ──────────────────────────

import { Router } from 'express';
import { startTimer, controlTimer, getActiveTimers, getTimerHistory } from '../services/timerService.js';
import { timerPresets } from '../config/presets.js';
import { log } from '../middleware/logging.js';

const router = Router();

// Frontend sync endpoints
router.get("/api/timers", async (req, res) => {
  try {
    const activeTimers = getActiveTimers();
    const timers = Array.from(activeTimers.values()).map(t => ({
      id: t.id,
      name: t.name,
      remainingSeconds: t.remainingSeconds,
      originalDuration: t.durationSeconds,
      status: t.status,
      createdAt: t.createdAt,
    }));
    
    res.json({
      activeTimers: timers,
      presets: timerPresets,
      history: getTimerHistory().slice(-20),
      timestamp: new Date().toISOString(),
      // Add polling metadata for UI
      _pollingEnabled: true,
      _pollingInterval: 1000,
      _lastUpdate: new Date().toISOString(),
    });
  } catch (err: any) {
    log.error("API error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/api/timers/:timerId/control", async (req, res) => {
  try {
    const { timerId } = req.params;
    const { action } = req.body;
    
    if (!action || !['pause', 'resume', 'stop'].includes(action)) {
      return res.status(400).json({
        error: "action parameter is required and must be 'pause', 'resume', or 'stop'",
      });
    }

    const response = await controlTimer(timerId, action);
    res.json(response);
  } catch (err: any) {
    log.error("API error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/api/timers", async (req, res) => {
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
    log.error("API error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
