// ────────────────────────── Timer Presets ──────────────────────────

import { TimerPreset } from '../types/index.js';

export const timerPresets: TimerPreset[] = [
  { name: "Quick Break", durationSeconds: 60, label: "1min" },
  { name: "Coffee Break", durationSeconds: 300, label: "5min" },
  { name: "Work Session", durationSeconds: 1500, label: "25min" },
  { name: "Long Break", durationSeconds: 900, label: "15min" },
  { name: "Exercise", durationSeconds: 1800, label: "30min" },
  { name: "Deep Work", durationSeconds: 3600, label: "1hr" },
];
