// ────────────────────────── Timer Types ──────────────────────────

export interface Timer {
  id: string;
  name: string;
  durationSeconds: number;
  remainingSeconds: number;
  status: 'running' | 'paused' | 'stopped' | 'completed';
  createdAt: string;
  completedAt?: string;
}

export interface TimerPreset {
  name: string;
  durationSeconds: number;
  label: string;
}

export interface TimerHistory {
  id: string;
  name: string;
  originalDuration: number;
  elapsedSeconds: number;
  completedAt: string;
  status: 'stopped' | 'completed';
}

export interface TimerCallParams {
  name?: string;
  durationSeconds?: number;
}

export interface ControlTimerParams {
  timerId?: string;
  action?: 'pause' | 'resume' | 'stop';
}

export interface McpResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  structuredContent: any;
  _meta?: {
    source: string;
    widgetType: string;
  };
}
