type TimerCallParams = { durationSeconds?: number };

declare global {
  interface Window {
    openai: {
      callTool: (name: string, args?: TimerCallParams) => Promise<any>;
      toolOutput?: any;
    };
  }
}

// Ensure the global is available
const root = document.getElementById("timer-root")!;

// Export to make this an external module
export {};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function createTimerDisplay(minutesLeft: number, secondsLeft: number) {
  root.innerHTML = "";
  
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  `;

  const title = document.createElement("h2");
  title.textContent = "⏰ Countdown Timer";
  title.style.cssText = `
    margin: 0 0 20px 0;
    color: #333;
    font-size: 24px;
  `;
  container.appendChild(title);

  const timerDisplay = document.createElement("div");
  timerDisplay.id = "timer-display";
  timerDisplay.style.cssText = `
    font-size: 48px;
    font-weight: bold;
    color: #2c3e50;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 20px 0;
    text-align: center;
    min-width: 200px;
  `;
  container.appendChild(timerDisplay);

  const statusText = document.createElement("div");
  statusText.id = "timer-status";
  statusText.style.cssText = `
    font-size: 16px;
    color: #666;
    margin-top: 10px;
    text-align: center;
  `;
  container.appendChild(statusText);

  const controls = document.createElement("div");
  controls.style.cssText = `
    margin-top: 20px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  `;

  const startButton = document.createElement("button");
  startButton.textContent = "Start 30s Timer";
  startButton.style.cssText = `
    padding: 10px 20px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
  `;
  startButton.onclick = () => callTimer(30);
  controls.appendChild(startButton);

  const startButton2 = document.createElement("button");
  startButton2.textContent = "Start 2min Timer";
  startButton2.style.cssText = `
    padding: 10px 20px;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
  `;
  startButton2.onclick = () => callTimer(120);
  controls.appendChild(startButton2);

  const startButton3 = document.createElement("button");
  startButton3.textContent = "Start 5min Timer";
  startButton3.style.cssText = `
    padding: 10px 20px;
    background: #27ae60;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
  `;
  startButton3.onclick = () => callTimer(300);
  controls.appendChild(startButton3);

  container.appendChild(controls);
  root.appendChild(container);

  // Initialize display
  updateTimerDisplay(minutesLeft, secondsLeft);
}

function updateTimerDisplay(minutesLeft: number, secondsLeft: number) {
  const display = document.getElementById("timer-display");
  const status = document.getElementById("timer-status");
  
  if (display) {
    const totalSeconds = minutesLeft * 60 + secondsLeft;
    display.textContent = formatTime(totalSeconds);
    
    if (totalSeconds <= 0) {
      display.style.color = "#e74c3c";
      if (status) status.textContent = "⏰ Time's up!";
    } else if (totalSeconds <= 10) {
      display.style.color = "#f39c12";
      if (status) status.textContent = "⚠️ Almost done!";
    } else {
      display.style.color = "#2c3e50";
      if (status) status.textContent = "⏳ Timer running...";
    }
  }
}

let currentTimer: NodeJS.Timeout | null = null;

function startCountdown(minutesLeft: number, secondsLeft: number) {
  // Clear any existing timer
  if (currentTimer) {
    clearInterval(currentTimer);
  }

  let totalSeconds = minutesLeft * 60 + secondsLeft;
  
  // Update display immediately
  updateTimerDisplay(Math.floor(totalSeconds / 60), totalSeconds % 60);
  
  currentTimer = setInterval(() => {
    totalSeconds--;
    
    if (totalSeconds <= 0) {
      updateTimerDisplay(0, 0);
      clearInterval(currentTimer!);
      currentTimer = null;
      
      // Show completion message
      const status = document.getElementById("timer-status");
      if (status) {
        status.textContent = "🎉 Timer completed!";
        status.style.color = "#27ae60";
        status.style.fontWeight = "bold";
      }
    } else {
      updateTimerDisplay(Math.floor(totalSeconds / 60), totalSeconds % 60);
    }
  }, 1000);
}

async function callTimer(durationSeconds: number) {
  try {
    const result = await window.openai.callTool("startTimer", { durationSeconds });
    const structured = result?.structuredContent ?? window.openai.toolOutput ?? {};
    
    if (structured.error) {
      const status = document.getElementById("timer-status");
      if (status) {
        status.textContent = `❌ Error: ${structured.error}`;
        status.style.color = "#e74c3c";
      }
      return;
    }
    
    const { minutesLeft = 0, secondsLeft = 0 } = structured;
    startCountdown(minutesLeft, secondsLeft);
    
  } catch (e) {
    const status = document.getElementById("timer-status");
    if (status) {
      status.textContent = "❌ Failed to start timer";
      status.style.color = "#e74c3c";
    }
  }
}

async function init() {
  try {
    // Try to get initial timer data if available
    const structured = window.openai.toolOutput ?? {};
    const { minutesLeft = 0, secondsLeft = 0 } = structured;
    
    createTimerDisplay(minutesLeft, secondsLeft);
    
    // If we have valid timer data, start the countdown
    if (minutesLeft > 0 || secondsLeft > 0) {
      startCountdown(minutesLeft, secondsLeft);
    }
  } catch (e) {
    // Fallback: show empty timer
    createTimerDisplay(0, 0);
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
