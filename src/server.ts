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

// ────────────────────────── MCP Server ──────────────────────────
const server = new McpServer({
  name: "timer-countdown-server",
  version: "1.0.0",
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
async function startTimer(durationSeconds: number) {
  try {
    if (durationSeconds <= 0) {
      throw new Error("Duration must be greater than 0");
    }

    if (durationSeconds > 3600) { // Max 1 hour
      throw new Error("Duration cannot exceed 3600 seconds (1 hour)");
    }

    const minutesLeft = Math.floor(durationSeconds / 60);
    const secondsLeft = durationSeconds % 60;

    return {
      content: [
        {
          type: "text",
          text: `⏰ Timer started for ${minutesLeft}m ${secondsLeft}s!`,
        },
      ],
      structuredContent: {
        secondsLeft,
        minutesLeft,
        totalDuration: durationSeconds,
        timestamp: new Date().toISOString(),
      },
      _meta: {
        source: "timer-server",
        widgetType: "countdown",
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

// ────────────────────────── MCP Tool Registration ──────────────────────────
server.registerTool(
  "startTimer",
  {
    title: "Start Timer",
    description: "Start a countdown timer with specified duration in seconds.",
    _meta: {
      "openai/outputTemplate": "ui://widget/timer.html",
      "openai/toolInvocation/invoking": "Starting timer…",
      "openai/toolInvocation/invoked": "Timer started successfully.",
      "openai/widgetAccessible": true,
    },
    inputSchema: {
      durationSeconds: z.number().int().min(1).max(3600),
    },
  },
  async ({ durationSeconds }) => {
    const result = await startTimer(durationSeconds);
    return result as unknown as any;
  }
);

// ────────────────────────── REST API Endpoint ──────────────────────────
app.post("/tools/startTimer", async (req, res) => {
  try {
    const { durationSeconds } = req.body;
    
    if (!durationSeconds || typeof durationSeconds !== "number") {
      return res.status(400).json({
        error: "durationSeconds parameter is required and must be a number",
        example: { durationSeconds: 60 },
      });
    }

    const response = await startTimer(durationSeconds);
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
            name: "timer-countdown-server",
            version: "1.0.0",
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
              description: "Start a countdown timer with specified duration in seconds.",
              inputSchema: {
                type: "object",
                properties: {
                  durationSeconds: {
                    type: "number",
                    description: "Duration in seconds (1-3600)",
                    minimum: 1,
                    maximum: 3600,
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
              description: "Interactive countdown timer widget",
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
                  "openai/widgetDescription": "Displays a live countdown timer that updates every second. Can call startTimer tool from the UI.",
                  "openai/widgetPrefersBorder": true,
                },
              },
            ],
          },
        });
      }
    }

    if (method === "tools/call" && params?.name === "startTimer") {
      const { durationSeconds } = params?.arguments || {};
      const result = await startTimer(durationSeconds);
      return res.json({ jsonrpc: "2.0", id, result });
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

// ────────────────────────── Health Check ──────────────────────────
app.get("/health", (_req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    server: "timer-countdown-server",
    version: "1.0.0",
  };
  res.json(health);
});

// ────────────────────────── Static Assets ──────────────────────────
app.use("/web", express.static("web"));

// ────────────────────────── Start Server ──────────────────────────
app.listen(PORT, () => {
  log.success(`⏰ Timer Countdown MCP Server running on http://localhost:${PORT}`);
  log.info(`📡 MCP endpoint: POST /mcp`);
  log.info(`🔧 REST endpoint: POST /tools/startTimer`);
  log.info(`❤️ Health check: GET /health`);
  log.info(`📦 Static assets: /web/*`);
});