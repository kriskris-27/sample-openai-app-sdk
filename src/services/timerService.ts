// ────────────────────────── Timer Service ──────────────────────────

import { Timer, TimerPreset, McpResponse } from '../types/index.js';
import { log } from '../middleware/logging.js';
import { TIMER_LIMITS } from '../config/index.js';

// In-memory storage (in production, use a database)
let activeTimers: Map<string, Timer> = new Map();
let timerHistory: Timer[] = [];

export function generateTimerId(): string {
  return `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createTimer(name: string, durationSeconds: number): Timer {
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

export function pauseTimer(timerId: string): boolean {
  const timer = activeTimers.get(timerId);
  if (timer && timer.status === 'running') {
    timer.status = 'paused';
    return true;
  }
  return false;
}

export function resumeTimer(timerId: string): boolean {
  const timer = activeTimers.get(timerId);
  if (timer && timer.status === 'paused') {
    timer.status = 'running';
    return true;
  }
  return false;
}

export function stopTimer(timerId: string): boolean {
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

export function completeTimer(timerId: string): boolean {
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

export function updateTimer(timerId: string): boolean {
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

export async function startTimer(name: string, durationSeconds: number): Promise<McpResponse> {
  try {
    if (durationSeconds <= 0) {
      throw new Error("Duration must be greater than 0");
    }
    if (durationSeconds > TIMER_LIMITS.MAX_DURATION) {
      throw new Error(`Duration cannot exceed ${TIMER_LIMITS.MAX_DURATION} seconds (2 hours)`);
    }

    const timer = createTimer(name, durationSeconds);
    const minutesLeft = Math.floor(timer.remainingSeconds / 60);
    const secondsLeft = timer.remainingSeconds % 60;

    // Get fresh status immediately after creation
    const freshStatus = await getTimerStatus();

    return {
      content: [
        {
          type: "text",
          text: `⏰ Timer "${timer.name}" started for ${minutesLeft}m ${secondsLeft}s! (ID: ${timer.id})`,
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
        // Use fresh status data to ensure UI gets latest state
        activeTimers: freshStatus.structuredContent.activeTimers,
        presets: [], // Will be injected from config
        history: freshStatus.structuredContent.history,
        timestamp: new Date().toISOString(),
        // Add refresh hint for UI
        _refreshRequired: true,
        _newTimerId: timer.id,
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

export async function controlTimer(timerId: string, action: 'pause' | 'resume' | 'stop'): Promise<McpResponse> {
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

    // Get fresh status immediately after control action
    const freshStatus = await getTimerStatus();

    return {
      content: [{ type: "text", text: message }],
      structuredContent: {
        success,
        action,
        timerId,
        // Use fresh status data to ensure UI gets latest state
        activeTimers: freshStatus.structuredContent.activeTimers,
        history: freshStatus.structuredContent.history,
        timestamp: new Date().toISOString(),
        // Add refresh hint for UI
        _refreshRequired: true,
        _affectedTimerId: timerId,
      },
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `❌ Error: ${error.message}` }],
      structuredContent: { error: error.message },
    };
  }
}

export async function getTimerStatus(): Promise<McpResponse> {
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
      presets: [], // Will be injected from config
      history: timerHistory.slice(-20),
      timestamp: new Date().toISOString(),
    },
  };
}

// Getters for external access
export function getActiveTimers(): Map<string, Timer> {
  return activeTimers;
}

export function getTimerHistory(): Timer[] {
  return timerHistory;
}

// Timer update loop
export function startTimerUpdateLoop(): void {
  setInterval(() => {
    for (const [timerId, timer] of activeTimers) {
      if (timer.status === 'running') {
        updateTimer(timerId);
      }
    }
  }, 1000);
}

// Enhanced status with polling metadata
export async function getTimerStatusWithPolling(): Promise<McpResponse> {
  const baseStatus = await getTimerStatus();
  
  return {
    ...baseStatus,
    structuredContent: {
      ...baseStatus.structuredContent,
      // Add polling metadata for UI
      _pollingEnabled: true,
      _pollingInterval: 1000, // 1 second for live updates
      _lastUpdate: new Date().toISOString(),
    },
  };
}

// Optimistic timer creation for immediate UI feedback
export function createOptimisticTimer(name: string, durationSeconds: number): Timer {
  const timer = createTimer(name, durationSeconds);
  
  // Mark as optimistic for UI handling
  (timer as any)._optimistic = true;
  (timer as any)._createdAt = Date.now();
  
  return timer;
}

// Reconcile optimistic timer with server state
export function reconcileOptimisticTimer(optimisticTimer: Timer, serverTimers: Timer[]): Timer | null {
  const serverTimer = serverTimers.find(t => t.id === optimisticTimer.id);
  if (serverTimer) {
    return serverTimer; // Use server data
  }
  
  // If not found on server, it might have been created but not yet synced
  // Return the optimistic timer for now
  return optimisticTimer;
}
