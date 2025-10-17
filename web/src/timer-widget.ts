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

export {};

type IntervalHandle = ReturnType<typeof setInterval>;

const MAX_DURATION = 7200;

interface Timer {
  id: string;
  name: string;
  remainingSeconds: number;
  status: 'running' | 'paused' | 'stopped' | 'completed';
  originalDuration: number;
}

interface TimerPreset {
  name: string;
  durationSeconds: number;
  label: string;
}

interface TimerHistory {
  id: string;
  name: string;
  originalDuration: number;
  elapsedSeconds: number;
  completedAt: string;
  status: 'stopped' | 'completed';
}

let activeTimers: Map<string, Timer> = new Map();
let timerPresets: TimerPreset[] = [];
let timerHistory: TimerHistory[] = [];
let updateInterval: IntervalHandle | null = null;
let syncInterval: IntervalHandle | null = null;

let inputValues = { name: '', duration: '' };
let focusedElement: 'name' | 'duration' | null = null;

let audioCtx: AudioContext | null = null;

// Server sync configuration
const SERVER_BASE_URL = window.location.origin;
const SYNC_INTERVAL_MS = 2000; // Sync every 2 seconds

function $(id: string) {
  return document.getElementById(id);
}

function safeId(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds | 0);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
}

function statusChip(status: Timer['status']) {
  if (status === 'running') return { icon: '▶️', bg: '#27ae60' };
  if (status === 'paused') return { icon: '⏸️', bg: '#f39c12' };
  if (status === 'completed') return { icon: '✅', bg: '#2ecc71' };
  return { icon: '⏹️', bg: '#e74c3c' };
}

function playNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch {}
}

// Server synchronization functions
async function syncWithServer() {
  try {
    const response = await fetch(`${SERVER_BASE_URL}/api/timers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.warn(`Server sync failed: ${response.status} ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    
    // Update presets from server
    if (data.presets) {
      timerPresets = data.presets;
    }
    
    // Update history from server
    if (data.history) {
      timerHistory = data.history.map((h: any) => ({
        id: h.id,
        name: h.name,
        originalDuration: h.originalDuration || h.durationSeconds,
        elapsedSeconds: h.elapsedSeconds || (h.originalDuration || h.durationSeconds) - (h.remainingSeconds || 0),
        completedAt: h.completedAt,
        status: h.status
      }));
    }
    
    // Update active timers from server
    if (data.activeTimers) {
      const serverTimers = new Map<string, Timer>();
      
      data.activeTimers.forEach((serverTimer: any) => {
        const timer: Timer = {
          id: serverTimer.id,
          name: serverTimer.name,
          remainingSeconds: serverTimer.remainingSeconds,
          status: serverTimer.status,
          originalDuration: serverTimer.originalDuration
        };
        serverTimers.set(timer.id, timer);
      });
      
      // Check for timers that completed on server but are still active locally
      const localTimerIds = new Set(activeTimers.keys());
      const serverTimerIds = new Set(serverTimers.keys());
      
      // Remove local timers that are no longer on server
      for (const localId of localTimerIds) {
        if (!serverTimerIds.has(localId)) {
          const localTimer = activeTimers.get(localId);
          if (localTimer && localTimer.status === 'running') {
            // Timer was completed on server, add to history
            timerHistory.push({
              id: localTimer.id,
              name: localTimer.name,
              originalDuration: localTimer.originalDuration,
              elapsedSeconds: localTimer.originalDuration,
              completedAt: new Date().toISOString(),
              status: 'completed'
            });
            playNotificationSound();
          }
          activeTimers.delete(localId);
        }
      }
      
      // Update or add timers from server
      for (const [id, serverTimer] of serverTimers) {
        const localTimer = activeTimers.get(id);
        if (!localTimer || localTimer.remainingSeconds !== serverTimer.remainingSeconds || localTimer.status !== serverTimer.status) {
          activeTimers.set(id, serverTimer);
        }
      }
      
      // Re-render if there were changes
      renderActiveTimers();
      renderHistory();
    }
  } catch (error) {
    console.warn('Failed to sync with server:', error);
  }
}

function startServerSync() {
  if (syncInterval) return;
  syncInterval = setInterval(syncWithServer, SYNC_INTERVAL_MS);
}

function stopServerSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

function updateHeaderSubtitle() {
  const el = $('header-subtitle');
  if (el) el.textContent = `${activeTimers.size} active timers • ${timerHistory.length} completed`;
}

function createTimerCard(timer: Timer): HTMLElement {
  const card = document.createElement('div');
  card.className = 'timer-card';
  card.style.cssText = 'background:white;border:2px solid #e1e8ed;border-radius:12px;padding:16px;margin:8px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1);transition:all .3s ease;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';

  const nameEl = document.createElement('h3');
  nameEl.textContent = timer.name;
  nameEl.style.cssText = 'margin:0;font-size:18px;color:#2c3e50;';

  const chip = document.createElement('span');
  const chipData = statusChip(timer.status);
  chip.textContent = chipData.icon;
  chip.style.cssText = `font-size:12px;padding:4px 8px;background:${chipData.bg};color:white;border-radius:6px;`;

  header.appendChild(nameEl);
  header.appendChild(chip);

  const timeDisplay = document.createElement('div');
  const safe = safeId(timer.id);
  timeDisplay.id = `timer-display-${safe}`;
  timeDisplay.style.cssText = 'font-size:32px;font-weight:bold;text-align:center;margin:12px 0;';
  timeDisplay.textContent = formatTime(timer.remainingSeconds);
  setTimeColor(timeDisplay, timer.remainingSeconds);

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;justify-content:center;';

  const pauseBtn = document.createElement('button');
  pauseBtn.textContent = timer.status === 'running' ? 'Pause' : 'Resume';
  pauseBtn.style.cssText = `padding:8px 16px;background:${timer.status === 'running' ? '#f39c12' : '#27ae60'};color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;`;
  pauseBtn.onclick = () => controlTimer(timer.id, timer.status === 'running' ? 'pause' : 'resume');

  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stop';
  stopBtn.style.cssText = 'padding:8px 16px;background:#e74c3c;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;';
  stopBtn.onclick = () => controlTimer(timer.id, 'stop');

  controls.appendChild(pauseBtn);
  controls.appendChild(stopBtn);

  card.appendChild(header);
  card.appendChild(timeDisplay);
  card.appendChild(controls);

  return card;
}

function setTimeColor(el: HTMLElement, remainingSeconds: number) {
  el.style.color = remainingSeconds <= 10 ? '#e74c3c' : remainingSeconds <= 30 ? '#f39c12' : '#2c3e50';
}

function updateTimerDisplay(timerId: string, remainingSeconds: number) {
  const el = $(`timer-display-${safeId(timerId)}`);
  if (el) {
    el.textContent = formatTime(remainingSeconds);
    setTimeColor(el, remainingSeconds);
  }
}

function renderActiveTimers() {
  const container = $('active-timers');
  if (!container) return;
  container.innerHTML = '';
  if (activeTimers.size === 0) {
    const p = document.createElement('p');
    p.textContent = 'No active timers. Start one above!';
    p.style.cssText = 'text-align:center;color:#666;font-style:italic;padding:20px;';
    container.appendChild(p);
  } else {
    activeTimers.forEach(t => container.appendChild(createTimerCard(t)));
  }
  updateHeaderSubtitle();
}

function createHistoryItem(h: TimerHistory): HTMLElement {
  const item = document.createElement('div');
  item.style.cssText = 'padding:8px 12px;background:#f8f9fa;border-left:4px solid #27ae60;margin:4px 0;border-radius:4px;font-size:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;';

  const left = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = h.name;
  const sep = document.createTextNode(' – ');
  const dur = document.createElement('span');
  dur.textContent = `${formatTime(h.originalDuration)} (ran ${formatTime(h.elapsedSeconds)})`;
  left.appendChild(strong);
  left.appendChild(sep);
  left.appendChild(dur);

  const right = document.createElement('span');
  const dt = new Date(h.completedAt).toLocaleString();
  right.textContent = `${h.status === 'completed' ? '✔ completed' : '■ stopped'} • ${dt}`;
  right.style.cssText = 'color:#666;font-size:12px;';

  item.appendChild(left);
  item.appendChild(right);
  return item;
}

function renderHistory() {
  const container = $('timer-history');
  if (!container) return;
  container.innerHTML = '';
  if (timerHistory.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No completed timers yet.';
    p.style.cssText = 'text-align:center;color:#666;font-style:italic;padding:20px;';
    container.appendChild(p);
  } else {
    // most recent first
    [...timerHistory].slice(-10).reverse().forEach(h => container.appendChild(createHistoryItem(h)));
  }
  updateHeaderSubtitle();
}

function renderUI() {
  const root = $('timer-root');
  if (!root) return;

  root.innerHTML = '';

  const container = document.createElement('div');
  container.style.cssText = 'font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;padding:20px;';

  const header = document.createElement('div');
  header.style.cssText = 'text-align:center;margin-bottom:24px;';

  const title = document.createElement('h1');
  title.textContent = '⏰ Advanced Timer Dashboard';
  title.style.cssText = 'margin:0 0 8px 0;color:#2c3e50;font-size:28px;';

  const subtitle = document.createElement('p');
  subtitle.id = 'header-subtitle';
  subtitle.style.cssText = 'margin:0;color:#666;font-size:14px;';

  header.appendChild(title);
  header.appendChild(subtitle);

  const customSection = document.createElement('div');
  customSection.style.cssText = 'background:#f8f9fa;padding:16px;border-radius:12px;margin-bottom:20px;';

  const customTitle = document.createElement('h3');
  customTitle.textContent = '🎯 Start Custom Timer';
  customTitle.style.cssText = 'margin:0 0 12px 0;color:#2c3e50;font-size:18px;';

  const customForm = document.createElement('div');
  customForm.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Timer name (optional, e.g., Coffee Break)';
  nameInput.value = inputValues.name;
  nameInput.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;flex:1;min-width:150px;';
  nameInput.addEventListener('input', e => inputValues.name = (e.target as HTMLInputElement).value);
  nameInput.addEventListener('focus', () => focusedElement = 'name');
  nameInput.addEventListener('blur', () => { if (focusedElement === 'name') focusedElement = null; });

  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.placeholder = 'Duration (seconds, 1–7200)';
  durationInput.value = inputValues.duration;
  durationInput.min = '1';
  durationInput.max = `${MAX_DURATION}`;
  durationInput.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;width:140px;';
  durationInput.addEventListener('input', e => inputValues.duration = (e.target as HTMLInputElement).value);
  durationInput.addEventListener('focus', () => focusedElement = 'duration');
  durationInput.addEventListener('blur', () => { if (focusedElement === 'duration') focusedElement = null; });

  const startBtn = document.createElement('button');
  startBtn.textContent = 'Start';
  startBtn.style.cssText = 'padding:8px 16px;background:#27ae60;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;';
  startBtn.onclick = () => {
    const raw = inputValues.duration.trim();
    if (!/^\d+$/.test(raw)) { alert('Enter a valid integer duration (1–7200 seconds)'); return; }
    let seconds = parseInt(raw, 10);
    if (seconds < 1 || seconds > MAX_DURATION) { alert('Enter valid duration (1–7200 seconds)'); return; }
    const name = (inputValues.name || '').trim() || `Timer ${activeTimers.size + 1}`;
    callTimer(name, seconds);
    inputValues.name = '';
    inputValues.duration = '';
    nameInput.value = '';
    durationInput.value = '';
    restoreFocus();
  };

  customForm.appendChild(nameInput);
  customForm.appendChild(durationInput);
  customForm.appendChild(startBtn);
  customSection.appendChild(customTitle);
  customSection.appendChild(customForm);

  const presetSection = document.createElement('div');
  presetSection.style.cssText = 'margin-bottom:20px;';
  const presetTitle = document.createElement('h3');
  presetTitle.textContent = '🔥 Presets';
  presetTitle.style.cssText = 'margin:0 0 12px 0;color:#2c3e50;font-size:18px;';
  const presetContainer = document.createElement('div');
  presetContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
  timerPresets.forEach(p => presetContainer.appendChild(createPresetButton(p)));
  presetSection.appendChild(presetTitle);
  presetSection.appendChild(presetContainer);

  const activeContainer = document.createElement('div');
  activeContainer.id = 'active-timers';
  activeContainer.style.cssText = 'margin-bottom:20px;';

  const historySection = document.createElement('div');
  const historyTitle = document.createElement('h3');
  historyTitle.textContent = '📜 History';
  historyTitle.style.cssText = 'margin:0 0 12px 0;color:#2c3e50;font-size:18px;';
  const historyContainer = document.createElement('div');
  historyContainer.id = 'timer-history';
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
  restoreFocus();
}

function restoreFocus() {
  if (focusedElement === 'name') $('timer-root')?.querySelector<HTMLInputElement>('input[placeholder^="Timer name"]')?.focus();
  if (focusedElement === 'duration') $('timer-root')?.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
}

function createPresetButton(preset: TimerPreset): HTMLElement {
  const b = document.createElement('button');
  b.textContent = `${preset.label} - ${preset.name}`;
  b.style.cssText = 'padding:10px 16px;background:#3498db;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;margin:4px;transition:background .2s;';
  b.onmouseover = () => b.style.background = '#2980b9';
  b.onmouseout = () => b.style.background = '#3498db';
  b.onclick = () => callTimer(preset.name, preset.durationSeconds);
  return b;
}

async function callTimer(name: string, durationSeconds: number) {
  try {
    // Try to create timer on server first
    try {
      const response = await fetch(`${SERVER_BASE_URL}/api/timers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, durationSeconds })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.structuredContent?.timer) {
          const serverTimer = data.structuredContent.timer;
          const t: Timer = {
            id: serverTimer.id,
            name: serverTimer.name || name,
            remainingSeconds: serverTimer.totalDuration || durationSeconds,
            originalDuration: serverTimer.totalDuration || durationSeconds,
            status: 'running'
          };
          activeTimers.set(t.id, t);
          renderActiveTimers();
          if (!updateInterval) startUpdateLoop();
          return;
        }
      } else {
        console.warn(`Server timer creation failed: ${response.status} ${response.statusText}`);
      }
    } catch (serverError) {
      console.warn('Server timer creation failed, falling back to local:', serverError);
    }
    
    // Fallback to local timer creation
    const id = `${name}-${Date.now()}`;
    const t: Timer = {
      id,
      name,
      remainingSeconds: durationSeconds,
      originalDuration: durationSeconds,
      status: 'running'
    };
    activeTimers.set(id, t);
    renderActiveTimers();
    if (!updateInterval) startUpdateLoop();
  } catch (e) {
    console.error(e);
  }
}

async function controlTimer(timerId: string, action: 'pause' | 'resume' | 'stop') {
  const t = activeTimers.get(timerId);
  if (!t) return;

  // Try to control timer on server first
  try {
    const response = await fetch(`${SERVER_BASE_URL}/api/timers/${timerId}/control`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action })
    });
    
    if (response.ok) {
      // Server control successful, let sync handle the updates
      return;
    } else {
      console.warn(`Server timer control failed: ${response.status} ${response.statusText}`);
    }
  } catch (serverError) {
    console.warn('Server timer control failed, falling back to local:', serverError);
  }

  // Fallback to local control
  if (action === 'pause') t.status = 'paused';
  if (action === 'resume') t.status = 'running';
  if (action === 'stop') {
    t.status = 'stopped';
    const elapsed = t.originalDuration - Math.max(0, t.remainingSeconds);
    activeTimers.delete(timerId);
    timerHistory.push({
      id: t.id,
      name: t.name,
      originalDuration: t.originalDuration,
      elapsedSeconds: clamp(elapsed, 0, t.originalDuration),
      completedAt: new Date().toISOString(),
      status: 'stopped'
    });
  }
  renderActiveTimers();
  renderHistory();
  maybeStopLoop();
}

function startUpdateLoop() {
  if (updateInterval) return;
  updateInterval = setInterval(() => {
    activeTimers.forEach(t => {
      if (t.status === 'running') {
        t.remainingSeconds = Math.max(0, t.remainingSeconds - 1);
        if (t.remainingSeconds === 0) {
          t.status = 'completed';
          activeTimers.delete(t.id);
          timerHistory.push({
            id: t.id,
            name: t.name,
            originalDuration: t.originalDuration,
            elapsedSeconds: t.originalDuration,
            completedAt: new Date().toISOString(),
            status: 'completed'
          });
          playNotificationSound();
        } else {
          updateTimerDisplay(t.id, t.remainingSeconds);
        }
      }
    });
    if (activeTimers.size > 0) renderActiveTimers(); // to refresh status chips/labels
    renderHistory();
    maybeStopLoop();
  }, 1000);
}

function maybeStopLoop() {
  if (activeTimers.size === 0 && updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    renderActiveTimers(); // show empty state immediately
  }
}

timerPresets = [
  { name: 'Pomodoro', durationSeconds: 1500, label: '🍅 25 min' },
  { name: 'Short Break', durationSeconds: 300, label: '☕ 5 min' },
  { name: 'Long Break', durationSeconds: 900, label: '🛌 15 min' }
];

function startApp() {
  if ($('timer-root')) {
    renderUI();
    startServerSync(); // Start syncing with server
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      renderUI();
      startServerSync(); // Start syncing with server
    }, { once: true });
  }
}

startApp();
