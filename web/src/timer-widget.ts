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

// Store input values to preserve them during re-renders
let inputValues = {
  name: '',
  duration: ''
};

// Store focus state to restore after re-rendering
let focusedElement: string | null = null;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function playNotificationSound() {
  try {
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
    font-size: 12px;
    padding: 4px 8px;
    background: ${timer.status === 'running' ? '#27ae60' : timer.status === 'paused' ? '#f39c12' : '#e74c3c'};
    color: white;
    border-radius: 6px;
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

function renderActiveTimers() {
  const container = document.getElementById("active-timers")!;
  container.innerHTML = "";

  if (activeTimers.size === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.textContent = "No active timers. Start one above!";
    emptyMsg.style.cssText = `
      text-align: center;
      color: #666;
      font-style: italic;
      padding: 20px;
    `;
    container.appendChild(emptyMsg);
  } else {
    activeTimers.forEach(timer => {
      container.appendChild(createTimerCard(timer));
    });
  }
}

function renderHistory() {
  const container = document.getElementById("timer-history")!;
  container.innerHTML = "";

  if (timerHistory.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.textContent = "No completed timers yet.";
    emptyMsg.style.cssText = `
      text-align: center;
      color: #666;
      font-style: italic;
      padding: 20px;
    `;
    container.appendChild(emptyMsg);
  } else {
    timerHistory.slice(-10).forEach(history => {
      container.appendChild(createHistoryItem(history));
    });
  }
}

function renderUI() {
  // Ensure root exists
  if (!root) return;

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
  header.style.cssText = `text-align: center; margin-bottom: 24px;`;

  const title = document.createElement("h1");
  title.textContent = "⏰ Advanced Timer Dashboard";
  title.style.cssText = `margin:0 0 8px 0; color: #2c3e50; font-size:28px;`;

  const subtitle = document.createElement("p");
  subtitle.textContent = `${activeTimers.size} active timers • ${timerHistory.length} completed`;
  subtitle.style.cssText = `margin:0; color:#666; font-size:14px;`;

  header.appendChild(title);
  header.appendChild(subtitle);

  // Custom Timer Section (static, not re-rendered)
  const customSection = document.createElement("div");
  customSection.style.cssText = `background:#f8f9fa; padding:16px; border-radius:12px; margin-bottom:20px;`;

  const customTitle = document.createElement("h3");
  customTitle.textContent = "🎯 Start Custom Timer";
  customTitle.style.cssText = `margin:0 0 12px 0; color:#2c3e50; font-size:18px;`;

  const customForm = document.createElement("div");
  customForm.style.cssText = `display:flex; gap:8px; align-items:center; flex-wrap:wrap;`;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Timer name (optional, e.g., Coffee Break)";
  nameInput.value = inputValues.name;
  nameInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    flex: 1;
    min-width: 150px;
  `;
  nameInput.addEventListener('input', e => inputValues.name = (e.target as HTMLInputElement).value);
  nameInput.addEventListener('focus', () => focusedElement = 'name');
  nameInput.addEventListener('blur', () => { if (focusedElement === 'name') focusedElement = null; });

  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.placeholder = "Duration (seconds)";
  durationInput.value = inputValues.duration;
  durationInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    width: 120px;
  `;
  durationInput.addEventListener('input', e => inputValues.duration = (e.target as HTMLInputElement).value);
  durationInput.addEventListener('focus', () => focusedElement = 'duration');
  durationInput.addEventListener('blur', () => { if (focusedElement === 'duration') focusedElement = null; });

  const startBtn = document.createElement("button");
  startBtn.textContent = "Start";
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
    const seconds = parseInt(inputValues.duration || '0');
    if (seconds <= 0) {
      alert("Enter valid duration (1-7200 seconds)");
      return;
    }
    const name = inputValues.name.trim() || `Timer ${activeTimers.size + 1}`;
    callTimer(name, seconds);
    inputValues.name = '';
    inputValues.duration = '';
    nameInput.value = '';
    durationInput.value = '';
  };

  customForm.appendChild(nameInput);
  customForm.appendChild(durationInput);
  customForm.appendChild(startBtn);
  customSection.appendChild(customTitle);
  customSection.appendChild(customForm);

  // Presets
  const presetSection = document.createElement("div");
  presetSection.style.cssText = `margin-bottom: 20px;`;
  const presetTitle = document.createElement("h3");
  presetTitle.textContent = "🔥 Presets";
  presetTitle.style.cssText = `margin:0 0 12px 0; color:#2c3e50; font-size:18px;`;

  const presetContainer = document.createElement("div");
  presetContainer.style.cssText = `display:flex; flex-wrap:wrap; gap:6px;`;
  timerPresets.forEach(p => presetContainer.appendChild(createPresetButton(p)));

  presetSection.appendChild(presetTitle);
  presetSection.appendChild(presetContainer);

  // Active timers container
  const activeContainer = document.createElement("div");
  activeContainer.id = "active-timers";
  activeContainer.style.cssText = `margin-bottom:20px;`;

  // Timer history
  const historySection = document.createElement("div");
  const historyTitle = document.createElement("h3");
  historyTitle.textContent = "📜 History";
  historyTitle.style.cssText = `margin:0 0 12px 0; color:#2c3e50; font-size:18px;`;

  const historyContainer = document.createElement("div");
  historyContainer.id = "timer-history";

  historySection.appendChild(historyTitle);
  historySection.appendChild(historyContainer);

  container.appendChild(header);
  container.appendChild(customSection);
  container.appendChild(presetSection);
  container.appendChild(activeContainer);
  container.appendChild(historySection);

  root.appendChild(container);

  renderActiveTimers();
  renderHistory();
}

async function callTimer(name: string, durationSeconds: number) {
  try {
    const timerId = `${name}-${Date.now()}`;
    const newTimer: Timer = {
      id: timerId,
      name,
      remainingSeconds: durationSeconds,
      status: 'running',
      minutesLeft: Math.floor(durationSeconds / 60),
      secondsLeft: durationSeconds % 60
    };
    activeTimers.set(timerId, newTimer);
    renderActiveTimers();

    // Start update loop if not running
    if (!updateInterval) startUpdateLoop();
  } catch (e) {
    console.error(e);
  }
}

function controlTimer(timerId: string, action: 'pause' | 'resume' | 'stop') {
  const timer = activeTimers.get(timerId);
  if (!timer) return;

  if (action === 'pause') timer.status = 'paused';
  if (action === 'resume') timer.status = 'running';
  if (action === 'stop') {
    timer.status = 'stopped';
    activeTimers.delete(timerId);
    timerHistory.push({
      id: timer.id,
      name: timer.name,
      durationSeconds: timer.remainingSeconds,
      completedAt: new Date().toISOString()
    });
  }
  renderActiveTimers();
  renderHistory();
}

function startUpdateLoop() {
  updateInterval = setInterval(() => {
    activeTimers.forEach(timer => {
      if (timer.status === 'running') {
        timer.remainingSeconds--;
        if (timer.remainingSeconds <= 0) {
          timer.status = 'completed';
          activeTimers.delete(timer.id);
          timerHistory.push({
            id: timer.id,
            name: timer.name,
            durationSeconds: 0,
            completedAt: new Date().toISOString()
          });
          playNotificationSound();
        }
        updateTimerDisplay(timer.id, timer.remainingSeconds);
      }
    });
    renderHistory();

    // Stop loop if no active timers
    if (activeTimers.size === 0 && updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }, 1000);
}

// Initialize presets (example)
timerPresets = [
  { name: 'Pomodoro', durationSeconds: 1500, label: '🍅 25 min' },
  { name: 'Short Break', durationSeconds: 300, label: '☕ 5 min' },
  { name: 'Long Break', durationSeconds: 900, label: '🛌 15 min' },
];

renderUI();
