const $ = (id) => document.getElementById(id);
const money = (v) => `${v >= 0 ? "+" : ""}${Number(v || 0).toFixed(4)} U`;
const stake = (v) => v == null ? "—" : `${Number(v).toFixed(4)} U`;
const pct = (v) => v == null ? "—" : `${(Number(v) * 100).toFixed(2)}%`;
const isGitHubPages = window.location.hostname.endsWith("github.io");
let currentMarket = null;
let lastDataVersion = null;
let refreshing = false;

function colorize(el, value) {
  el.classList.remove("positive", "negative");
  if (value > 0) el.classList.add("positive");
  if (value < 0) el.classList.add("negative");
}

function renderRounds(target, values) {
  const entries = Array.from({length: 10}, (_, i) => Number(values?.[String(i + 1)] || 0));
  const max = Math.max(1, ...entries);
  target.innerHTML = entries.map((value, i) =>
    `<div class="round-bar"><b>${value}</b><i style="height:${Math.max(2, value / max * 44)}px"></i><span>R${i+1}</span></div>`
  ).join("");
}

function renderLine(prefix, line) {
  if (!line) return;
  const pnl = $(`${prefix}Pnl`);
  pnl.textContent = money(line.realized_pnl);
  colorize(pnl, line.realized_pnl);
  $(`${prefix}Round`).textContent = `ROUND ${line.current_round}`;
  $(`${prefix}Stake`).textContent = stake(line.current_stake);
  $(`${prefix}Status`).textContent = line.stopped ? "已停止" : line.current_filled ? "已成交" : "挂单中";
  $(`${prefix}Record`).textContent = `${line.fills} / ${line.wins}`;
  $(`${prefix}Rate`).textContent = pct(line.hit_rate);
  renderRounds($(`${prefix}Rounds`), line.hits_by_round_1_to_10);
}

function renderTrades(trades) {
  $("tradeRows").innerHTML = trades.map(t => `
    <tr>
      <td><span class="direction ${t.direction.toLowerCase()}">${t.direction}</span></td>
      <td>${t.won ? "命中" : "失败"} · ${t.winner}</td>
      <td>${stake(t.stake)}</td>
      <td>+${t.fill_second}s</td>
      <td>${t.ask ? t.ask.toFixed(2) : "—"}</td>
      <td class="${t.pnl >= 0 ? "positive" : "negative"}">${money(t.pnl)}</td>
    </tr>`).join("") || `<tr><td colspan="6" class="muted">尚无已结算成交</td></tr>`;
}

function drawChart(points) {
  const canvas = $("chart");
  const scale = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = 230;
  canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);
  const pad = {l: 42, r: 18, t: 12, b: 26};
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  ctx.strokeStyle = "#252b36"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + h * i / 4;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width-pad.r, y); ctx.stroke();
  }
  if (!points.length) return;
  const mapX = s => pad.l + Math.min(300, Math.max(0, s)) / 300 * w;
  const draw = (values, color, min, max) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.beginPath();
    let started = false;
    values.forEach(p => {
      if (p.v == null || Number.isNaN(p.v)) return;
      const x = mapX(p.s), y = pad.t + (max - p.v) / (max - min || 1) * h;
      started ? ctx.lineTo(x,y) : ctx.moveTo(x,y); started = true;
    });
    ctx.stroke();
  };
  const displacement = points.map(p => ({s:p.second, v:p.open ? (p.spot/p.open-1)*10000 : 0}));
  const dvals = displacement.map(p=>p.v);
  const extent = Math.max(2, ...dvals.map(Math.abs));
  draw(displacement, "#e5b45a", -extent, extent);
  draw(points.map(p=>({s:p.second,v:p.upAsk})), "#48d7a1", 0, 1);
  draw(points.map(p=>({s:p.second,v:p.downAsk})), "#ff6b78", 0, 1);
}

function updateClock(current) {
  if (!current) { $("marketClock").textContent = "等待中"; $("marketSlug").textContent = "等待完整市场"; return; }
  const now = Math.floor(Date.now()/1000);
  const left = Math.max(0, current.end_ts - now);
  $("marketClock").textContent = `${Math.floor(left/60)}:${String(left%60).padStart(2,"0")}`;
  $("marketSlug").textContent = current.slug;
}

async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    let response = isGitHubPages
      ? await fetch(`./data/dashboard.json?t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        })
      : await fetch("/api/dashboard", {
          cache: "no-store",
          signal: controller.signal,
        });
    if (!response.ok && !isGitHubPages) {
      response = await fetch(`./data/dashboard.json?t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
    }
    const data = await response.json();
    currentMarket = data.current;
    updateClock(currentMarket);
    const healthy = data.health?.status === "healthy";
    document.querySelector(".health").classList.toggle("ok", healthy);
    $("healthText").textContent = healthy ? "数据正常" : "数据延迟";
    $("updatedAt").textContent = `更新 ${new Date(
      data.sourceUpdatedAt || data.generatedAt
    ).toLocaleTimeString("zh-CN")}`;
    if (data.dataVersion && data.dataVersion === lastDataVersion) return;
    lastDataVersion = data.dataVersion || data.generatedAt;
    const summary = data.summary || {}, lines = summary.lines || {};
    $("totalPnl").textContent = money(summary.total_realized_pnl);
    colorize($("totalPnl"), summary.total_realized_pnl);
    $("openRisk").textContent = stake(summary.total_open_risk);
    $("marketCount").textContent = `已完成 ${summary.completed_markets || 0} 个市场`;
    renderLine("up", lines.Up); renderLine("down", lines.Down);
    renderTrades(data.trades || []); drawChart(data.chart || []);
    const last = data.chart?.at(-1);
    $("upAsk").textContent = last?.upAsk ? last.upAsk.toFixed(2) : "—";
    $("downAsk").textContent = last?.downAsk ? last.downAsk.toFixed(2) : "—";
  } catch {
    document.querySelector(".health").classList.remove("ok");
    $("healthText").textContent = "连接失败";
  } finally {
    clearTimeout(timeout);
    refreshing = false;
  }
}
refresh();
setInterval(refresh, isGitHubPages ? 60000 : 2000);
setInterval(() => updateClock(currentMarket), 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
