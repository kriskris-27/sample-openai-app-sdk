// ────────────────────────── Logging Utilities ──────────────────────────

export const log = {
  info: (...args: any[]) => console.log("ℹ️", ...args),
  error: (...args: any[]) => console.error("❌", ...args),
  success: (...args: any[]) => console.log("✅", ...args),
};
