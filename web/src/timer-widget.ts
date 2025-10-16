type TimerCallParams = { name?: string; durationSeconds?: number };
type ControlTimerParams = { timerId?: string; action?: 'pause' | 'resume' | 'stop' };

declare global {
  interface Window {
    openai: {
      callTool: (name: string, args?: TimerCallParams | ControlTimerParams) => Promise<any>;
      toolOutput?: any;
    };
  }
}

// Export to make this an external module
export {};

const root = document.getElementById("timer-root")!;

interface Timer {
  id: string;
  name: string;
  remainingSeconds: number;
  status: 'running' | 'paused' | 'stopped' | 'completed';
  minutesLeft: number;
  secondsLeft: number;
}

interface TimerPreset {
  name: string;
  durationSeconds: number;
  label: string;
}

interface TimerHistory {
  id: string;
  name: string;
  durationSeconds: number;
  completedAt: string;
}

let activeTimers: Map<string, Timer> = new Map();
let timerPresets: TimerPreset[] = [];
let timerHistory: TimerHistory[] = [];
let updateInterval: NodeJS.Timeout | null = null;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function playNotificationSound() {
  try {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log("Could not play notification sound");
  }
}

function createTimerCard(timer: Timer): HTMLElement {
  const card = document.createElement("div");
  card.className = "timer-card";
  card.style.cssText = `
    background: white;
    border: 2px solid #e1e8ed;
    border-radius: 12px;
    padding: 16px;
    margin: 8px 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  `;

  const nameEl = document.createElement("h3");
  nameEl.textContent = timer.name;
  nameEl.style.cssText = `
    margin: 0;
    font-size: 18px;
    color: #2c3e50;
  `;

  const statusEl = document.createElement("span");
  statusEl.textContent = timer.status === 'running' ? '▶️' : timer.status === 'paused' ? '⏸️' : '⏹️';
  statusEl.style.cssText = `
    font-size: 16px;
    padding: 4px 8px;
    background: ${timer.status === 'running' ? '#27ae60' : timer.status === 'paused' ? '#f39c12' : '#e74c3c'};
    color: white;
    border-radius: 6px;
    font-size: 12px;
  `;

  header.appendChild(nameEl);
  header.appendChild(statusEl);

  const timeDisplay = document.createElement("div");
  timeDisplay.className = `timer-display-${timer.id}`;
  timeDisplay.style.cssText = `
    font-size: 32px;
    font-weight: bold;
    text-align: center;
    color: ${timer.remainingSeconds <= 10 ? '#e74c3c' : timer.remainingSeconds <= 30 ? '#f39c12' : '#2c3e50'};
    margin: 12px 0;
  `;
  timeDisplay.textContent = formatTime(timer.remainingSeconds);

  const controls = document.createElement("div");
  controls.style.cssText = `
    display: flex;
    gap: 8px;
    justify-content: center;
  `;

  const pauseBtn = document.createElement("button");
  pauseBtn.textContent = timer.status === 'running' ? "Pause" : "Resume";
  pauseBtn.style.cssText = `
    padding: 8px 16px;
    background: ${timer.status === 'running' ? '#f39c12' : '#27ae60'};
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
  `;
  pauseBtn.onclick = () => controlTimer(timer.id, timer.status === 'running' ? 'pause' : 'resume');

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";
  stopBtn.style.cssText = `
    padding: 8px 16px;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
  `;
  stopBtn.onclick = () => controlTimer(timer.id, 'stop');

  controls.appendChild(pauseBtn);
  controls.appendChild(stopBtn);

  card.appendChild(header);
  card.appendChild(timeDisplay);
  card.appendChild(controls);

  return card;
}

function createPresetButton(preset: TimerPreset): HTMLElement {
  const button = document.createElement("button");
  button.textContent = `${preset.label} - ${preset.name}`;
  button.style.cssText = `
    padding: 10px 16px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    margin: 4px;
    transition: background 0.2s;
  `;
  button.onmouseover = () => button.style.background = '#2980b9';
  button.onmouseout = () => button.style.background = '#3498db';
  button.onclick = () => callTimer(preset.name, preset.durationSeconds);
  return button;
}

function createHistoryItem(history: TimerHistory): HTMLElement {
  const item = document.createElement("div");
  item.style.cssText = `
    padding: 8px 12px;
    background: #f8f9fa;
    border-left: 4px solid #27ae60;
    margin: 4px 0;
    border-radius: 4px;
    font-size: 14px;
  `;
  
  const completedDate = new Date(history.completedAt).toLocaleString();
  item.innerHTML = `
    <strong>${history.name}</strong> - ${formatTime(history.durationSeconds)} 
    <span style="color: #666; font-size: 12px;">(${completedDate})</span>
  `;
  
  return item;
}

function updateTimerDisplay(timerId: string, remainingSeconds: number) {
  const display = document.querySelector(`.timer-display-${timerId}`) as HTMLElement;
  if (display) {
    display.textContent = formatTime(remainingSeconds);
    display.style.color = remainingSeconds <= 10 ? '#e74c3c' : remainingSeconds <= 30 ? '#f39c12' : '#2c3e50';
  }
}

function renderUI() {
  // Ensure root exists
  if (!root) {
    console.error('Timer root element not found');
    return;
  }
  
  root.innerHTML = "";
  
  const container = document.createElement("div");
  container.style.cssText = `
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    text-align: center;
    margin-bottom: 24px;
  `;

  const title = document.createElement("h1");
  title.textContent = "⏰ Advanced Timer Dashboard";
  title.style.cssText = `
    margin: 0 0 8px 0;
    color: #2c3e50;
    font-size: 28px;
  `;

  const subtitle = document.createElement("p");
  subtitle.textContent = `${activeTimers.size} active timers • ${timerHistory.length} completed`;
  subtitle.style.cssText = `
    margin: 0;
    color: #666;
    font-size: 14px;
  `;

  header.appendChild(title);
  header.appendChild(subtitle);

  // Custom Timer Section
  const customSection = document.createElement("div");
  customSection.style.cssText = `
    background: #f8f9fa;
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 20px;
  `;

  const customTitle = document.createElement("h3");
  customTitle.textContent = "🎯 Start Custom Timer";
  customTitle.style.cssText = `
    margin: 0 0 12px 0;
    color: #2c3e50;
    font-size: 18px;
  `;

  const customForm = document.createElement("div");
  customForm.style.cssText = `
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  `;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Timer name (e.g., Coffee Break)";
  nameInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    flex: 1;
    min-width: 150px;
  `;

  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.placeholder = "Seconds";
  durationInput.min = "1";
  durationInput.max = "7200";
  durationInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    width: 100px;
  `;

  const startBtn = document.createElement("button");
  startBtn.textContent = "Start Timer";
  startBtn.style.cssText = `
    padding: 8px 16px;
    background: #27ae60;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  `;
  startBtn.onclick = () => {
    const name = nameInput.value.trim() || "Custom Timer";
    const duration = parseInt(durationInput.value);
    if (duration > 0) {
      callTimer(name, duration);
      nameInput.value = "";
      durationInput.value = "";
    }
  };

  customForm.appendChild(nameInput);
  customForm.appendChild(durationInput);
  customForm.appendChild(startBtn);

  customSection.appendChild(customTitle);
  customSection.appendChild(customForm);

  // Presets Section
  const presetsSection = document.createElement("div");
  presetsSection.style.cssText = `
    margin-bottom: 20px;
  `;

  const presetsTitle = document.createElement("h3");
  presetsTitle.textContent = "⚡ Quick Presets";
  presetsTitle.style.cssText = `
    margin: 0 0 12px 0;
    color: #2c3e50;
    font-size: 18px;
  `;

  const presetsContainer = document.createElement("div");
  presetsContainer.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  `;

  // Default presets if none loaded
  const defaultPresets = [
    { name: "Quick Break", durationSeconds: 60, label: "1min" },
    { name: "Coffee Break", durationSeconds: 300, label: "5min" },
    { name: "Work Session", durationSeconds: 1500, label: "25min" },
    { name: "Long Break", durationSeconds: 900, label: "15min" },
    { name: "Exercise", durationSeconds: 1800, label: "30min" },
    { name: "Deep Work", durationSeconds: 3600, label: "1hr" }
  ];

  const presetsToShow = timerPresets.length > 0 ? timerPresets : defaultPresets;
  presetsToShow.forEach(preset => {
    presetsContainer.appendChild(createPresetButton(preset));
  });

  presetsSection.appendChild(presetsTitle);
  presetsSection.appendChild(presetsContainer);

  // Active Timers Section
  const activeSection = document.createElement("div");
  activeSection.style.cssText = `
    margin-bottom: 20px;
  `;

  const activeTitle = document.createElement("h3");
  activeTitle.textContent = `🔄 Active Timers (${activeTimers.size})`;
  activeTitle.style.cssText = `
    margin: 0 0 12px 0;
    color: #2c3e50;
    font-size: 18px;
  `;

  const activeContainer = document.createElement("div");
  activeContainer.id = "active-timers";

  if (activeTimers.size === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.textContent = "No active timers. Start one above!";
    emptyMsg.style.cssText = `
      text-align: center;
      color: #666;
      font-style: italic;
      padding: 20px;
    `;
    activeContainer.appendChild(emptyMsg);
  } else {
    activeTimers.forEach(timer => {
      activeContainer.appendChild(createTimerCard(timer));
    });
  }

  activeSection.appendChild(activeTitle);
  activeSection.appendChild(activeContainer);

  // History Section
  const historySection = document.createElement("div");
  historySection.style.cssText = `
    background: #f8f9fa;
    padding: 16px;
    border-radius: 12px;
  `;

  const historyTitle = document.createElement("h3");
  historyTitle.textContent = `📊 Recent History (${timerHistory.length})`;
  historyTitle.style.cssText = `
    margin: 0 0 12px 0;
    color: #2c3e50;
    font-size: 18px;
  `;

  const historyContainer = document.createElement("div");
  historyContainer.id = "timer-history";

  if (timerHistory.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.textContent = "No completed timers yet.";
    emptyMsg.style.cssText = `
      text-align: center;
      color: #666;
      font-style: italic;
      padding: 20px;
    `;
    historyContainer.appendChild(emptyMsg);
  } else {
    timerHistory.slice(-10).forEach(history => {
      historyContainer.appendChild(createHistoryItem(history));
    });
  }

  historySection.appendChild(historyTitle);
  historySection.appendChild(historyContainer);

  container.appendChild(header);
  container.appendChild(customSection);
  container.appendChild(presetsSection);
  container.appendChild(activeSection);
  container.appendChild(historySection);
  root.appendChild(container);
}

function startUpdateLoop() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  updateInterval = setInterval(() => {
    let hasUpdates = false;
    
    activeTimers.forEach((timer, timerId) => {
      if (timer.status === 'running' && timer.remainingSeconds > 0) {
        timer.remainingSeconds--;
        updateTimerDisplay(timerId, timer.remainingSeconds);
        
        if (timer.remainingSeconds <= 0) {
          // Timer completed
          playNotificationSound();
          activeTimers.delete(timerId);
          timerHistory.push({
            id: timerId,
            name: timer.name,
            durationSeconds: timer.remainingSeconds + timer.remainingSeconds,
            completedAt: new Date().toISOString()
          });
          hasUpdates = true;
        }
      }
    });
    
    if (hasUpdates) {
      renderUI();
    }
  }, 1000);
}

async function callTimer(name: string, durationSeconds: number) {
  try {
    if (!window.openai?.callTool) {
      console.error('OpenAI callTool not available');
      alert('Timer functionality not available in this context');
      return;
    }

    const result = await window.openai.callTool("startTimer", { name, durationSeconds });
    const structured = result?.structuredContent ?? window.openai.toolOutput ?? {};
    
    if (structured.error) {
      alert(`Error: ${structured.error}`);
      return;
    }
    
    if (structured.timer) {
      const timer: Timer = {
        id: structured.timer.id,
        name: structured.timer.name,
        remainingSeconds: structured.timer.minutesLeft * 60 + structured.timer.secondsLeft,
        status: structured.timer.status,
        minutesLeft: structured.timer.minutesLeft,
        secondsLeft: structured.timer.secondsLeft,
      };
      
      activeTimers.set(timer.id, timer);
      
      if (structured.presets) {
        timerPresets = structured.presets;
      }
      
      if (structured.history) {
        timerHistory = structured.history;
      }
      
      renderUI();
      startUpdateLoop();
    }
    
  } catch (e) {
    console.error('Failed to start timer:', e);
    alert("Failed to start timer. Please try again.");
  }
}

async function controlTimer(timerId: string, action: 'pause' | 'resume' | 'stop') {
  try {
    if (!window.openai?.callTool) {
      console.error('OpenAI callTool not available');
      return;
    }

    const result = await window.openai.callTool("controlTimer", { timerId, action });
    const structured = result?.structuredContent ?? window.openai.toolOutput ?? {};
    
    if (structured.success) {
      if (action === 'stop') {
        activeTimers.delete(timerId);
        if (structured.history) {
          timerHistory = structured.history;
        }
      } else {
        // Update timer status
        const timer = activeTimers.get(timerId);
        if (timer) {
          timer.status = action === 'pause' ? 'paused' : 'running';
        }
      }
      
      renderUI();
    } else {
      alert(`Failed to ${action} timer`);
    }
    
  } catch (e) {
    console.error(`Failed to ${action} timer:`, e);
    alert(`Failed to ${action} timer. Please try again.`);
  }
}

async function refreshStatus() {
  try {
    if (!window.openai?.callTool) {
      console.error('OpenAI callTool not available');
      return;
    }

    const result = await window.openai.callTool("getTimerStatus", {});
    const structured = result?.structuredContent ?? window.openai.toolOutput ?? {};
    
    if (structured.activeTimers) {
      activeTimers.clear();
      structured.activeTimers.forEach((t: any) => {
        if (t && t.id) {
          activeTimers.set(t.id, {
            id: t.id,
            name: t.name || 'Timer',
            remainingSeconds: t.remainingSeconds || 0,
            status: t.status || 'running',
            minutesLeft: t.minutesLeft || 0,
            secondsLeft: t.secondsLeft || 0,
          });
        }
      });
    }
    
    if (structured.presets) {
      timerPresets = structured.presets;
    }
    
    if (structured.history) {
      timerHistory = structured.history;
    }
    
    renderUI();
    startUpdateLoop();
    
  } catch (e) {
    console.error("Failed to refresh status:", e);
  }
}

async function init() {
  try {
    // Always render UI first to avoid blank space
    renderUI();
    
    // Try to get initial data
    const structured = window.openai?.toolOutput ?? {};
    
    if (structured.activeTimers && Array.isArray(structured.activeTimers)) {
      structured.activeTimers.forEach((t: any) => {
        if (t && t.id) {
          activeTimers.set(t.id, {
            id: t.id,
            name: t.name || 'Timer',
            remainingSeconds: t.remainingSeconds || 0,
            status: t.status || 'running',
            minutesLeft: t.minutesLeft || 0,
            secondsLeft: t.secondsLeft || 0,
          });
        }
      });
    }
    
    if (structured.presets && Array.isArray(structured.presets)) {
      timerPresets = structured.presets;
    }
    
    if (structured.history && Array.isArray(structured.history)) {
      timerHistory = structured.history;
    }
    
    // Re-render with data
    renderUI();
    startUpdateLoop();
    
  } catch (e) {
    console.error('Timer widget init error:', e);
    // Ensure UI is always rendered
    renderUI();
  }
}

// Ensure root element exists before initializing
function ensureRootExists() {
  if (!root) {
    console.error('Timer root element not found');
    return false;
  }
  return true;
}

// Initialize immediately
if (ensureRootExists()) {
  init();
} else {
  // Retry after a short delay
  setTimeout(() => {
    if (ensureRootExists()) {
      init();
    }
  }, 100);
}