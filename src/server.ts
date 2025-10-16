import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";

dotenv.config();

const app = express();
app.use(express.json());


console.log(
    "Alpha Vantage key:",
    process.env.ALPHA_VANTAGE_API_KEY ? "✅ Loaded" : "❌ Missing"
  );

// skip ngrok warning banner
app.use((_req, res, next) => {
  res.set("ngrok-skip-browser-warning", "true");
  next();
});

const PORT = Number(process.env.PORT || 3000);
const ALPHAVANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY || "";

// ────────────────────────── MCP Server ──────────────────────────
const server = new McpServer({
  name: "top-movers-server",
  version: "0.2.0",
});

// ────────────────────────── Widget Loader ──────────────────────────
const WIDGET_JS = (() => {
  try {
    return readFileSync("web/dist/widget.js", "utf8");
  } catch {
    console.warn("⚠️  web/dist/widget.js not found — widget UI disabled.");
    return "";
  }
})();

server.registerResource(
  "top-movers-widget",
  "ui://widget/top-movers.html",
  {},
  async () => ({
    contents: [
      {
        uri: "ui://widget/top-movers.html",
        mimeType: "text/html+skybridge",
        text: `
<div id="top-movers-root"></div>
<script type="module">${WIDGET_JS}</script>
        `.trim(),
        _meta: {
          "openai/widgetDescription":
            "Displays top gainers and losers from Alpha Vantage and can call the topMovers tool from the UI.",
          "openai/widgetPrefersBorder": true,
        },
      },
    ],
  })
);

// ────────────────────────── Business Logic ──────────────────────────
async function fetchTopMovers(limit: number) {
  if (!ALPHAVANTAGE_API_KEY) {
    return {
      content: [{ type: "text", text: "Missing ALPHAVANTAGE_API_KEY in environment." }],
      structuredContent: { error: "Missing API key" },
    };
  }

  const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHAVANTAGE_API_KEY}`;
  const { data } = await axios.get(url, { timeout: 15000 });

  const clamp = (arr: any[] = []) => arr.slice(0, limit);
  return {
    content: [{ type: "text", text: `Showing top ${limit} movers.` }],
    structuredContent: {
      gainers: clamp(data?.top_gainers),
      losers: clamp(data?.top_losers),
      active: clamp(data?.most_actively_traded),
      lastSyncedAt: new Date().toISOString(),
    },
    _meta: { source: "alphavantage" },
  };
}

// ────────────────────────── MCP Tool Registration ──────────────────────────
server.registerTool(
  "topMovers",
  {
    title: "Top Movers",
    description: "Fetch Alpha Vantage TOP_GAINERS_LOSERS and return top gainers/losers.",
    _meta: {
      "openai/outputTemplate": "ui://widget/top-movers.html",
      "openai/toolInvocation/invoking": "Fetching top movers…",
      "openai/toolInvocation/invoked": "Top movers fetched.",
      "openai/widgetAccessible": true,
    },
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().default(10),
    },
  },
  async ({ limit = 10 }) => {
    const result = await fetchTopMovers(limit);
    return { ...result } as any;
  }
);

// ────────────────────────── REST Endpoint ──────────────────────────
app.post("/tools/topMovers", async (req, res) => {
  try {
    const limit = Number(req.body?.limit ?? 10);
    const response = await fetchTopMovers(Number.isFinite(limit) ? limit : 10);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

// ────────────────────────── JSON-RPC /mcp Endpoint ──────────────────────────
app.post("/mcp", async (req, res) => {
  try {
    const { id = null, method, params = {} } = req.body || {};

    if (method === "tools/call" && params?.name === "topMovers") {
      const limit = Number(params?.arguments?.limit ?? 10);
      const result = await fetchTopMovers(Number.isFinite(limit) ? limit : 10);
      return res.json({ jsonrpc: "2.0", id, result });
    }

    res
      .status(400)
      .json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

// ────────────────────────── Health & Static ──────────────────────────
app.get("/health", (_req, res) => res.send("ok"));
app.use("/web", express.static("web"));

// ────────────────────────── Start ──────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
