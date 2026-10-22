// CSV Lens UI. State: the parsed dataset, inferred types, current filter and sort.
(() => {
  const $ = (s) => document.querySelector(s);
  const state = { name: "", headers: [], rows: [], types: [], stats: [], filtered: [], query: "", sort: { col: null, desc: false }, chart: null };

  // ---------- Loading ----------
  function loadText(text, name) {
    const { headers, rows, delimiter } = CSV.parse(text);
    if (!headers.length) { alert("That file looks empty."); return; }
    state.name = name; state.headers = headers; state.rows = rows;
    state.types = headers.map((_, i) => CSV.inferType(rows.map((r) => r[i])));
    state.stats = headers.map((_, i) => CSV.columnStats(rows.map((r) => r[i]), state.types[i]));
    state.query = ""; $("#search").value = ""; state.sort = { col: null, desc: false };
    const delimName = { ",": "comma", "\t": "tab", ";": "semicolon", "|": "pipe" }[delimiter] || delimiter;
    $("#meta").textContent = `${name} · ${fmtInt(rows.length)} rows · ${headers.length} columns · ${delimName}-separated · parsed locally`;
    $("#drop").classList.add("hidden"); $("#app").classList.remove("hidden");
    applyFilter(); renderOverview(); populateChartControls(); renderChart(); renderTable(); showTab("overview");
  }
  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result), file.name);
    reader.readAsText(file);
  }
  $("#file").addEventListener("change", (e) => e.target.files[0] && loadFile(e.target.files[0]));
  const loadSample = () => loadText(SAMPLE_CSV, "sample-orders.csv");
  $("#btnSample").addEventListener("click", loadSample);
  $("#btnSample2").addEventListener("click", loadSample);
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  document.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  // ---------- Formatting ----------
  const fmtInt = (n) => n.toLocaleString();
  const fmtNum = (n) => n == null ? "–" : Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmtDate = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "–";
  const pct = (x) => (x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0) + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- Filtering & sorting ----------
  function applyFilter() {
    const q = state.query.trim().toLowerCase();
    state.filtered = q ? state.rows.filter((r) => r.some((v) => String(v).toLowerCase().includes(q))) : state.rows.slice();
    const { col, desc } = state.sort;
    if (col != null) {
      const t = state.types[col];
      const key = t === "number" ? (v) => CSV.toNumber(v) : t === "date" ? (v) => { const d = CSV.toDate(v); return d ? d.getTime() : null; } : (v) => String(v).toLowerCase();
      state.filtered.sort((a, b) => {
        const ka = key(a[col]), kb = key(b[col]);
        if (ka == null || ka === "") return 1; if (kb == null || kb === "") return -1;
        return (ka < kb ? -1 : ka > kb ? 1 : 0) * (desc ? -1 : 1);
      });
    }
  }
  let searchTimer;
  $("#search").addEventListener("input", (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.query = e.target.value; applyFilter(); renderTable(); renderChart(); }, 120); });

  // ---------- Overview ----------
  function renderOverview() {
    const n = state.rows.length, cols = state.headers.length;
    const cells = n * cols, missing = state.stats.reduce((a, s) => a + s.missing, 0);
    const byType = state.types.reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {});
    $("#kpis").innerHTML = [
      ["Rows", fmtInt(n)], ["Columns", cols],
      ["Numeric", byType.number || 0], ["Dates", byType.date || 0], ["Text", (byType.string || 0) + (byType.boolean || 0)],
      ["Missing cells", cells ? pct(missing / cells) : "0%"],
    ].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("");

    $("#cards").innerHTML = state.headers.map((h, i) => {
      const s = state.stats[i], t = state.types[i];
      const miss = s.missing ? `<span class="${s.missingPct > 0.2 ? "bad" : "warn"}">${pct(s.missingPct)} missing</span>` : "no missing";
      let body = "";
      if (t === "number") {
        const max = Math.max(...s.histogram.map((b) => b.count), 1);
        body = `<div class="hist">${s.histogram.map((b) => `<i style="height:${Math.max(2, (b.count / max) * 100)}%" title="${fmtNum(b.from)} – ${fmtNum(b.to)}: ${b.count}"></i>`).join("")}</div>
          <div class="stats"><span>min</span><b>${fmtNum(s.min)}</b><span>max</span><b>${fmtNum(s.max)}</b><span>mean</span><b>${fmtNum(s.mean)}</b><span>median</span><b>${fmtNum(s.median)}</b><span>sum</span><b>${fmtNum(s.sum)}</b><span>std dev</span><b>${fmtNum(s.sd)}</b></div>`;
      } else if (t === "date") {
        body = `<div class="stats"><span>from</span><b>${fmtDate(s.min)}</b><span>to</span><b>${fmtDate(s.max)}</b><span>span</span><b>${s.spanDays == null ? "–" : s.spanDays + " days"}</b><span>unique</span><b>${fmtInt(s.unique)}</b></div>`;
      } else if (t === "empty") {
        body = `<div class="sub">Column is entirely empty.</div>`;
      } else {
        const tot = s.total - s.missing || 1;
        body = `<div class="topv">${s.top.map(([v, c]) => `<div style="--w:${(c / tot) * 100}%"><span title="${esc(v)}">${esc(v)}</span><b>${fmtInt(c)}</b></div>`).join("")}</div>
          <div class="sub">${fmtInt(s.unique)} unique value${s.unique === 1 ? "" : "s"}${s.unique === s.total - s.missing && s.unique > 1 ? " · looks like an ID" : ""}</div>`;
      }
      return `<div class="card"><div class="head"><div class="name" title="${esc(h)}">${esc(h)}</div><span class="badge ${t}">${t}</span></div><div class="sub">${miss}</div>${body}</div>`;
    }).join("");
  }

  // ---------- Chart ----------
  function populateChartControls() {
    const xs = state.headers.map((h, i) => ({ h, i, t: state.types[i] })).filter((c) => c.t !== "number" && c.t !== "empty" && state.stats[c.i].unique < state.rows.length);
    const ys = state.headers.map((h, i) => ({ h, i })).filter((c) => state.types[c.i] === "number");
    $("#xCol").innerHTML = xs.map((c) => `<option value="${c.i}">${esc(c.h)}</option>`).join("") || `<option value="">(no groupable columns)</option>`;
    $("#yCol").innerHTML = ys.map((c) => `<option value="${c.i}">${esc(c.h)}</option>`).join("");
    const dateFirst = xs.find((c) => c.t === "date"); if (dateFirst) $("#xCol").value = dateFirst.i;
    if (ys.length) { $("#agg").value = "sum"; } else { $("#agg").value = "count"; }
    syncChartControls();
  }
  function syncChartControls() {
    const xi = $("#xCol").value; const isDate = xi !== "" && state.types[+xi] === "date";
    $("#granWrap").classList.toggle("hidden", !isDate);
    $("#yWrap").classList.toggle("hidden", $("#agg").value === "count");
    $("#chartType").value = isDate && $("#chartType").value === "doughnut" ? "line" : $("#chartType").value;
  }
  ["#xCol", "#agg", "#yCol", "#gran", "#chartType"].forEach((s) => $(s).addEventListener("change", () => { syncChartControls(); renderChart(); }));

  function renderChart() {
    const xi = $("#xCol").value; if (xi === "") return;
    const x = +xi, xType = state.types[x], agg = $("#agg").value, yi = agg === "count" ? null : +$("#yCol").value;
    if (agg !== "count" && isNaN(yi)) return;
    const data = CSV.groupBy(state.filtered, x, xType, yi, agg, { granularity: $("#gran").value, limit: 20 });
    const type = $("#chartType").value;
    const label = agg === "count" ? "rows" : `${agg} of ${state.headers[yi]}`;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim(), muted = css.getPropertyValue("--muted").trim(), line = css.getPropertyValue("--line").trim();
    const palette = ["#4f46e5","#06b6d4","#16a34a","#d97706","#dc2626","#9333ea","#0891b2","#65a30d","#ea580c","#db2777","#4338ca","#0d9488","#ca8a04","#b91c1c","#7c3aed","#0e7490","#4d7c0f","#c2410c","#be185d","#3730a3"];
    if (state.chart) state.chart.destroy();
    state.chart = new Chart($("#chart"), {
      type,
      data: { labels: data.map((d) => d.label), datasets: [{ label, data: data.map((d) => +d.value.toFixed(2)), backgroundColor: type === "doughnut" ? palette : accent + "cc", borderColor: type === "line" ? accent : undefined, tension: 0.25, fill: false, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type === "doughnut", labels: { color: muted } } },
        scales: type === "doughnut" ? {} : { x: { ticks: { color: muted, maxRotation: 45 }, grid: { color: line } }, y: { ticks: { color: muted }, grid: { color: line }, beginAtZero: true } } },
    });
    $("#chartHint").textContent = `${data.length} ${xType === "date" ? $("#gran").value + "s" : "groups"}${xType !== "date" && state.stats[x].unique > 20 ? " (top 20 shown)" : ""} · ${fmtInt(state.filtered.length)} of ${fmtInt(state.rows.length)} rows${state.query ? ` matching "${state.query}"` : ""}`;
  }

  // ---------- Table ----------
  const PAGE = 300;
  function renderTable() {
    const thead = $("#table thead"), tbody = $("#table tbody");
    thead.innerHTML = `<tr>${state.headers.map((h, i) => `<th data-i="${i}" class="${state.sort.col === i ? "sorted" + (state.sort.desc ? " desc" : "") : ""}">${esc(h)}</th>`).join("")}</tr>`;
    thead.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
      const i = +th.dataset.i;
      state.sort = state.sort.col === i ? { col: i, desc: !state.sort.desc } : { col: i, desc: false };
      applyFilter(); renderTable();
    }));
    const rows = state.filtered.slice(0, PAGE);
    tbody.innerHTML = rows.map((r) => `<tr>${r.map((v, i) => CSV.isMissing(v) ? `<td class="missing">∅</td>` : `<td class="${state.types[i] === "number" ? "num" : ""}" title="${esc(v)}">${esc(v)}</td>`).join("")}</tr>`).join("");
    $("#tableHint").textContent = `Showing ${fmtInt(rows.length)} of ${fmtInt(state.filtered.length)} rows${state.query ? ` matching "${state.query}"` : ""}${state.filtered.length !== state.rows.length ? ` (${fmtInt(state.rows.length)} total)` : ""}. Click a header to sort.`;
  }

  // ---------- Export ----------
  $("#btnExport").addEventListener("click", () => {
    const blob = new Blob([CSV.serialize(state.headers, state.filtered)], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = state.name.replace(/\.[^.]+$/, "") + (state.query ? "-filtered" : "") + ".csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- Tabs ----------
  function showTab(name) {
    document.querySelectorAll(".tabs button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("hidden", t.id !== "tab-" + name));
    if (name === "chart") renderChart();
  }
  document.querySelectorAll(".tabs button[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
})();
