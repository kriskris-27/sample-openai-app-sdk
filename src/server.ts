// ────────────────────────── Imports ──────────────────────────
import express from "express";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";

// ────────────────────────── Config ──────────────────────────
dotenv.config();
const app = express();
app.use(express.json());

// Skip ngrok banner
app.use((_req, res, next) => {
  res.set("ngrok-skip-browser-warning", "true");
  next();
});

const PORT = Number(process.env.PORT || 3000);

// ────────────────────────── Logger ──────────────────────────
const log = {
  info: (...args: any[]) => console.log("ℹ️", ...args),
  error: (...args: any[]) => console.error("❌", ...args),
  success: (...args: any[]) => console.log("✅", ...args),
};

// ────────────────────────── Timer State Management ──────────────────────────
interface Timer {
  id: string;
  name: string;
  durationSeconds: number;
  remainingSeconds: number;
  status: 'running' | 'paused' | 'stopped' | 'completed';
  createdAt: string;
  completedAt?: string;
}

interface TimerPreset {
  name: string;
  durationSeconds: number;
  label: string;
}

// In-memory storage (in production, use a database)
let activeTimers: Map<string, Timer> = new Map();
let timerHistory: Timer[] = [];
let timerPresets: TimerPreset[] = [
  { name: "Quick Break", durationSeconds: 60, label: "1min" },
  { name: "Coffee Break", durationSeconds: 300, label: "5min" },
  { name: "Work Session", durationSeconds: 1500, label: "25min" },
  { name: "Long Break", durationSeconds: 900, label: "15min" },
  { name: "Exercise", durationSeconds: 1800, label: "30min" },
  { name: "Deep Work", durationSeconds: 3600, label: "1hr" },
];

// ────────────────────────── MCP Server ──────────────────────────
const server = new McpServer({
  name: "advanced-timer-server",
  version: "2.0.0",
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

// ────────────────────────── Timer Logic ──────────────────────────
function generateTimerId(): string {
  return `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createTimer(name: string, durationSeconds: number): Timer {
  const timer: Timer = {
    id: generateTimerId(),
    name: name || `Timer ${activeTimers.size + 1}`,
    durationSeconds,
    remainingSeconds: durationSeconds,
    status: 'running',
    createdAt: new Date().toISOString(),
  };
  
  activeTimers.set(timer.id, timer);
  return timer;
}

function pauseTimer(timerId: string): boolean {
  const timer = activeTimers.get(timerId);
  if (timer && timer.status === 'running') {
    timer.status = 'paused';
    return true;
  }
  return false;
}

function resumeTimer(timerId: string): boolean {
  const timer = activeTimers.get(timerId);
  if (timer && timer.status === 'paused') {
    timer.status = 'running';
    return true;
  }
  return false;
}

function stopTimer(timerId: string): boolean {
  const timer = activeTimers.get(timerId);
  if (timer && (timer.status === 'running' || timer.status === 'paused')) {
    timer.status = 'stopped';
    timer.completedAt = new Date().toISOString();
    timerHistory.push({ ...timer });
    activeTimers.delete(timerId);
    return true;
  }
  return false;
}

function completeTimer(timerId: string): boolean {
  const timer = activeTimers.get(timerId);
  if (timer && timer.status === 'running') {
    timer.status = 'completed';
    timer.remainingSeconds = 0;
    timer.completedAt = new Date().toISOString();
    timerHistory.push({ ...timer });
    activeTimers.delete(timerId);
    return true;
  }
  return false;
}

function updateTimer(timerId: string): boolean {
  const timer = activeTimers.get(timerId);
  if (timer && timer.status === 'running' && timer.remainingSeconds > 0) {
    timer.remainingSeconds--;
    if (timer.remainingSeconds <= 0) {
      return completeTimer(timerId);
    }
    return true;
  }
  return false;
}

// ────────────────────────── API Functions ──────────────────────────
async function startTimer(name: string, durationSeconds: number) {
  try {
    if (durationSeconds <= 0) {
      throw new Error("Duration must be greater than 0");
    }
    if (durationSeconds > 7200) { // Max 2 hours
      throw new Error("Duration cannot exceed 7200 seconds (2 hours)");
    }

    const timer = createTimer(name, durationSeconds);
    const minutesLeft = Math.floor(timer.remainingSeconds / 60);
    const secondsLeft = timer.remainingSeconds % 60;

    return {
      content: [
        {
          type: "text",
          text: `⏰ Timer "${timer.name}" started for ${minutesLeft}m ${secondsLeft}s!`,
        },
      ],
      structuredContent: {
        timer: {
          id: timer.id,
          name: timer.name,
          minutesLeft,
          secondsLeft,
          totalDuration: timer.durationSeconds,
          status: timer.status,
        },
        activeTimers: Array.from(activeTimers.values()).map(t => ({
          id: t.id,
          name: t.name,
          remainingSeconds: t.remainingSeconds,
          status: t.status,
        })),
        presets: timerPresets,
        history: timerHistory.slice(-10), // Last 10 completed timers
        timestamp: new Date().toISOString(),
      },
      _meta: {
        source: "advanced-timer-server",
        widgetType: "multi-timer",
      },
    };
  } catch (error: any) {
    log.error("Timer start failed:", error.message);
    return {
      content: [
        {
          type: "text",
          text: `❌ Error: ${error.message}`,
        },
      ],
      structuredContent: {
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function controlTimer(timerId: string, action: 'pause' | 'resume' | 'stop') {
  try {
    let success = false;
    let message = "";

    switch (action) {
      case 'pause':
        success = pauseTimer(timerId);
        message = success ? `⏸️ Timer paused` : "❌ Timer not found or not running";
        break;
      case 'resume':
        success = resumeTimer(timerId);
        message = success ? `▶️ Timer resumed` : "❌ Timer not found or not paused";
        break;
      case 'stop':
        success = stopTimer(timerId);
        message = success ? `⏹️ Timer stopped` : "❌ Timer not found";
        break;
    }

    return {
      content: [{ type: "text", text: message }],
      structuredContent: {
        success,
        action,
        timerId,
        activeTimers: Array.from(activeTimers.values()).map(t => ({
          id: t.id,
          name: t.name,
          remainingSeconds: t.remainingSeconds,
          status: t.status,
        })),
        history: timerHistory.slice(-10),
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `❌ Error: ${error.message}` }],
      structuredContent: { error: error.message },
    };
  }
}

async function getTimerStatus() {
  return {
    content: [{ type: "text", text: `📊 ${activeTimers.size} active timers, ${timerHistory.length} completed` }],
    structuredContent: {
      activeTimers: Array.from(activeTimers.values()).map(t => ({
        id: t.id,
        name: t.name,
        remainingSeconds: t.remainingSeconds,
        status: t.status,
        minutesLeft: Math.floor(t.remainingSeconds / 60),
        secondsLeft: t.remainingSeconds % 60,
      })),
      presets: timerPresets,
      history: timerHistory.slice(-20), // Last 20 completed timers
      timestamp: new Date().toISOString(),
    },
  };
}

// ────────────────────────── MCP Tool Registration ──────────────────────────
server.registerTool(
  "startTimer",
  {
    title: "Start Timer",
    description: "Start a new countdown timer with custom name and duration.",
    _meta: {
      "openai/outputTemplate": "ui://widget/timer.html",
      "openai/toolInvocation/invoking": "Starting timer…",
      "openai/toolInvocation/invoked": "Timer started successfully.",
      "openai/widgetAccessible": true,
    },
    inputSchema: {
      name: z.string().optional().default("Timer"),
      durationSeconds: z.number().int().min(1).max(7200),
    },
  },
  async ({ name = "Timer", durationSeconds }) => {
    const result = await startTimer(name, durationSeconds);
    return result as unknown as any;
  }
);

server.registerTool(
  "controlTimer",
  {
    title: "Control Timer",
    description: "Pause, resume, or stop an active timer.",
    _meta: {
      "openai/outputTemplate": "ui://widget/timer.html",
      "openai/toolInvocation/invoking": "Controlling timer…",
      "openai/toolInvocation/invoked": "Timer control executed.",
      "openai/widgetAccessible": true,
    },
    inputSchema: {
      timerId: z.string(),
      action: z.enum(["pause", "resume", "stop"]),
    },
  },
  async ({ timerId, action }) => {
    const result = await controlTimer(timerId, action);
    return result as unknown as any;
  }
);

server.registerTool(
  "getTimerStatus",
  {
    title: "Get Timer Status",
    description: "Get status of all active timers, presets, and history.",
    _meta: {
      "openai/outputTemplate": "ui://widget/timer.html",
      "openai/toolInvocation/invoking": "Fetching timer status…",
      "openai/toolInvocation/invoked": "Timer status retrieved.",
      "openai/widgetAccessible": true,
    },
    inputSchema: {},
  },
  async () => {
    const result = await getTimerStatus();
    return result as unknown as any;
  }
);

// ────────────────────────── REST API Endpoints ──────────────────────────
app.post("/tools/startTimer", async (req, res) => {
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

app.post("/tools/controlTimer", async (req, res) => {
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

app.get("/tools/getTimerStatus", async (req, res) => {
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

// ────────────────────────── MCP JSON-RPC Endpoint ──────────────────────────
app.post("/mcp", async (req, res) => {
  try {
    const { id = null, method, params = {} } = req.body || {};

    // MCP Protocol Methods
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: "advanced-timer-server",
            version: "2.0.0",
          },
        },
      });
    }

    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "startTimer",
              title: "Start Timer",
              description: "Start a new countdown timer with custom name and duration.",
              inputSchema: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Custom name for the timer",
                    default: "Timer",
                  },
                  durationSeconds: {
                    type: "number",
                    description: "Duration in seconds (1-7200)",
                    minimum: 1,
                    maximum: 7200,
                  },
                },
                required: ["durationSeconds"],
              },
              _meta: {
                "openai/outputTemplate": "ui://widget/timer.html",
                "openai/toolInvocation/invoking": "Starting timer…",
                "openai/toolInvocation/invoked": "Timer started successfully.",
                "openai/widgetAccessible": true,
              },
            },
            {
              name: "controlTimer",
              title: "Control Timer",
              description: "Pause, resume, or stop an active timer.",
              inputSchema: {
                type: "object",
                properties: {
                  timerId: {
                    type: "string",
                    description: "ID of the timer to control",
                  },
                  action: {
                    type: "string",
                    enum: ["pause", "resume", "stop"],
                    description: "Action to perform on the timer",
                  },
                },
                required: ["timerId", "action"],
              },
              _meta: {
                "openai/outputTemplate": "ui://widget/timer.html",
                "openai/toolInvocation/invoking": "Controlling timer…",
                "openai/toolInvocation/invoked": "Timer control executed.",
                "openai/widgetAccessible": true,
              },
            },
            {
              name: "getTimerStatus",
              title: "Get Timer Status",
              description: "Get status of all active timers, presets, and history.",
              inputSchema: {
                type: "object",
                properties: {},
              },
              _meta: {
                "openai/outputTemplate": "ui://widget/timer.html",
                "openai/toolInvocation/invoking": "Fetching timer status…",
                "openai/toolInvocation/invoked": "Timer status retrieved.",
                "openai/widgetAccessible": true,
              },
            },
          ],
        },
      });
    }

    if (method === "resources/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          resources: [
            {
              uri: "ui://widget/timer.html",
              name: "timer-widget",
              description: "Advanced multi-timer widget with controls and history",
              mimeType: "text/html+skybridge",
            },
          ],
        },
      });
    }

    if (method === "resources/read") {
      const uri = params?.uri;
      if (uri === "ui://widget/timer.html") {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri: "ui://widget/timer.html",
                mimeType: "text/html+skybridge",
                text: `
<div id="timer-root"></div>
<script type="module">${TIMER_WIDGET_JS}</script>
                `.trim(),
                _meta: {
                  "openai/widgetDescription": "Advanced timer widget with multiple timers, pause/resume controls, custom names, presets, and history tracking.",
                  "openai/widgetPrefersBorder": true,
                },
              },
            ],
          },
        });
      }
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params;
      
      if (name === "startTimer") {
        const { name: timerName = "Timer", durationSeconds } = args || {};
        const result = await startTimer(timerName, durationSeconds);
        return res.json({ jsonrpc: "2.0", id, result });
      }
      
      if (name === "controlTimer") {
        const { timerId, action } = args || {};
        const result = await controlTimer(timerId, action);
        return res.json({ jsonrpc: "2.0", id, result });
      }
      
      if (name === "getTimerStatus") {
        const result = await getTimerStatus();
        return res.json({ jsonrpc: "2.0", id, result });
      }
    }

    // Return JSON-RPC error with HTTP 200
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    });
  } catch (err: any) {
    log.error("MCP JSON-RPC error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

// ────────────────────────── Timer Update Loop ──────────────────────────
setInterval(() => {
  // Update all running timers every second
  for (const [timerId, timer] of activeTimers) {
    if (timer.status === 'running') {
      updateTimer(timerId);
    }
  }
}, 1000);

// ────────────────────────── Health Check ──────────────────────────
app.get("/health", (_req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    server: "advanced-timer-server",
    version: "2.0.0",
    activeTimers: activeTimers.size,
    completedTimers: timerHistory.length,
  };
  res.json(health);
});

// ────────────────────────── Static Assets ──────────────────────────
app.use("/web", express.static("web"));

// ────────────────────────── Start Server ──────────────────────────
app.listen(PORT, () => {
  log.success(`⏰ Advanced Timer MCP Server running on http://localhost:${PORT}`);
  log.info(`📡 MCP endpoint: POST /mcp`);
  log.info(`🔧 REST endpoints: POST /tools/startTimer, POST /tools/controlTimer, GET /tools/getTimerStatus`);
  log.info(`❤️ Health check: GET /health`);
  log.info(`📦 Static assets: /web/*`);
  log.info(`🎯 Features: Multiple timers, pause/resume, custom names, presets, history, sound alerts`);
});