// ────────────────────────── Server Configuration ──────────────────────────

export const PORT = Number(process.env.PORT || 3000);

export const SERVER_INFO = {
  name: "advanced-timer-server",
  version: "2.0.0",
};

export const MCP_CONFIG = {
  protocolVersion: "2024-11-05",
  capabilities: {
    tools: {},
    resources: {},
  },
};

export const TIMER_LIMITS = {
  MIN_DURATION: 1,
  MAX_DURATION: 7200, // 2 hours
};
