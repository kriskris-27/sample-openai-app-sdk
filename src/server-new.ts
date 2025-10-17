// ────────────────────────── Advanced Timer MCP Server ──────────────────────────

import express from "express";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";

// Import modules
import { corsMiddleware } from './middleware/cors';
import { log } from './middleware/logging';
import { PORT, SERVER_INFO } from './config';
import { registerMcpTools, handleMcpRequest } from './services/mcpService';
import { startTimerUpdateLoop, getActiveTimers, getTimerHistory } from './services/timerService';
import routes from './routes';

// ────────────────────────── Configuration ──────────────────────────
dotenv.config();
const app = express();

// ────────────────────────── Middleware ──────────────────────────
app.use(corsMiddleware);
app.use(express.json());

// Skip ngrok banner
app.use((_req, res, next) => {
  res.set("ngrok-skip-banner", "true");
  next();
});

// ────────────────────────── Widget Loader ──────────────────────────
const TIMER_WIDGET_JS = (() => {
  try {
    return readFileSync("web/dist/timer-widget.js", "utf8");
  } catch {
    console.warn("⚠️ web/dist/timer-widget.js not found — widget UI disabled.");
    return "";
  }
})();

// ────────────────────────── Routes ──────────────────────────
app.use('/', routes);

// ────────────────────────── Health Check ──────────────────────────
app.get("/health", (_req, res) => {
  const activeTimers = getActiveTimers();
  const timerHistory = getTimerHistory();
  
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    server: SERVER_INFO.name,
    version: SERVER_INFO.version,
    activeTimers: activeTimers.size,
    completedTimers: timerHistory.length,
  };
  res.json(health);
});

// ────────────────────────── Static Assets ──────────────────────────
app.use("/web", express.static("web"));

// ────────────────────────── Initialize Services ──────────────────────────
registerMcpTools();
startTimerUpdateLoop();

// ────────────────────────── Start Server ──────────────────────────
app.listen(PORT, () => {
  log.success(`⏰ Advanced Timer MCP Server running on http://localhost:${PORT}`);
  log.info(`📡 MCP endpoint: POST /mcp`);
  log.info(`🔧 REST endpoints: POST /tools/startTimer, POST /tools/controlTimer, GET /tools/getTimerStatus`);
  log.info(`❤️ Health check: GET /health`);
  log.info(`📦 Static assets: /web/*`);
  log.info(`🎯 Features: Multiple timers, pause/resume, custom names, presets, history, sound alerts`);
});
