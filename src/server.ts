import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";

dotenv.config();

const app = express();
app.use(express.json());

// Add header so ngrok skips its browser warning interstitial
app.use((_req, res, next) => {
  res.set("ngrok-skip-browser-warning", "true");
  next();
});

const PORT = Number(process.env.PORT || 3000);
const ALPHAVANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY || "";

// Create MCP server
const server = new McpServer({ name: "top-movers-server", version: "0.1.0" });

// Load built widget assets
const WIDGET_JS = (() => {
  try {
    return readFileSync("web/dist/widget.js", "utf8");
  } catch {
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
          "openai/widgetDescription": "Displays top gainers and losers from Alpha Vantage and can call the topMovers tool from the UI.",
          "openai/widgetPrefersBorder": true
        }
      }
    ]
  })
);

async function fetchTopMovers(limit: number) {
  if (!ALPHAVANTAGE_API_KEY) {
    return {
      content: [{ type: "text", text: "Missing ALPHAVANTAGE_API_KEY in environment." }],
      structuredContent: { error: "Missing API key" }
    };
  }
  const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHAVANTAGE_API_KEY}`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const topGainers: any[] = data?.top_gainers ?? [];
  const topLosers: any[] = data?.top_losers ?? [];
  const mostActivelyTraded: any[] = data?.most_actively_traded ?? [];

  const clamp = (arr: any[]) => arr.slice(0, limit);

  return {
    content: [{ type: "text", text: `Showing top ${limit} movers.` }],
    structuredContent: {
      gainers: clamp(topGainers),
      losers: clamp(topLosers),
      active: clamp(mostActivelyTraded),
      lastSyncedAt: new Date().toISOString()
    },
    _meta: {
      source: "alphavantage"
    }
  };
}

// Tool: topMovers
server.registerTool(
  "topMovers",
  {
    title: "Top Movers",
    description: "Fetch Alpha Vantage TOP_GAINERS_LOSERS and return top gainers/losers.",
    _meta: {
      "openai/outputTemplate": "ui://widget/top-movers.html",
      "openai/toolInvocation/invoking": "Fetching top movers…",
      "openai/toolInvocation/invoked": "Top movers fetched.",
      "openai/widgetAccessible": true
    },
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().default(10)
    }
  },
  async ({ limit = 10 }, _extra) => {
    const result = await fetchTopMovers(limit);
    return {
      ...result,
      content: result.content.map((c) => ({
        ...c,
        type: "text",
        text: c.text,
      })),
    } as any; // ✅ simple cast fixes the mismatch
  }
  
);

// Simple HTTP endpoint to call the tool logic directly (for local demo)
app.post("/tools/topMovers", async (req, res) => {
  try {
    const limit = Number(req.body?.limit ?? 10);
    const response = await fetchTopMovers(Number.isFinite(limit) ? limit : 10);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Health and static serving for widget debug
app.get("/health", (_req, res) => res.send("ok"));
app.use("/web", express.static("web"));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});


