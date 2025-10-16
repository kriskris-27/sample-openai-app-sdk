export {};
type ToolCallParams = { limit?: number };

declare global {
  interface Window {
    openai: {
      callTool: (name: string, args?: ToolCallParams) => Promise<any>;
      toolOutput?: any;
    };
  }
}

const root = document.getElementById("top-movers-root")!;

function createTable(title: string, rows: any[], columns: string[]) {
  const section = document.createElement("section");
  section.style.margin = "12px 0";

  const h = document.createElement("h3");
  h.textContent = title;
  h.style.margin = "6px 0";
  section.appendChild(h);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  columns.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    th.style.textAlign = "left";
    th.style.padding = "8px";
    th.style.borderBottom = "1px solid #ddd";
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = String(row[c] ?? "");
      td.style.padding = "8px";
      td.style.borderBottom = "1px solid #f0f0f0";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  section.appendChild(table);
  return section;
}

function render(structured: any) {
  root.innerHTML = "";
  const { gainers = [], losers = [], active = [], lastSyncedAt } = structured ?? {};

  const info = document.createElement("div");
  info.textContent = lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString()}` : "";
  info.style.fontSize = "12px";
  info.style.color = "#666";
  root.appendChild(info);

  const cols = ["ticker", "price", "change_amount", "change_percentage", "volume"];
  root.appendChild(createTable("Top Gainers", gainers, cols));
  root.appendChild(createTable("Top Losers", losers, cols));
  root.appendChild(createTable("Most Active", active, cols));
}

async function init() {
  try {
    const limit = 10;
    const result = await window.openai.callTool("topMovers", { limit });
    const structured = result?.structuredContent ?? window.openai.toolOutput ?? {};
    render(structured);
  } catch (e) {
    root.textContent = "Failed to load top movers.";
  }
}

// Hydrate immediately
init();


