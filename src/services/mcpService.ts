// ────────────────────────── MCP Service ──────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { startTimer, controlTimer, getTimerStatus } from './timerService.js';
import { timerPresets } from '../config/presets.js';
import { MCP_CONFIG, SERVER_INFO } from '../config/index.js';

export const server = new McpServer({
  name: SERVER_INFO.name,
  version: SERVER_INFO.version,
});

// Register MCP tools
export function registerMcpTools(): void {
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
}

// MCP JSON-RPC handler
export async function handleMcpRequest(req: any, res: any): Promise<void> {
  try {
    const { id = null, method, params = {} } = req.body || {};

    // MCP Protocol Methods
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_CONFIG.protocolVersion,
          capabilities: MCP_CONFIG.capabilities,
          serverInfo: SERVER_INFO,
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
        // Widget HTML would be loaded here
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri: "ui://widget/timer.html",
                mimeType: "text/html+skybridge",
                text: `<div id="timer-root"></div><script type="module" src="/web/dist/timer-widget.js"></script>`,
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
    console.error("MCP JSON-RPC error:", err.message);
    res.status(500).json({ 
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
}
