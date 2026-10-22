// CSV Lens — parsing, type inference, statistics. No dependencies.
// Everything runs in the browser; no data is ever uploaded.

const CSV = (() => {
  // ---------- Parsing (RFC 4180: quotes, escaped quotes, newlines inside quotes) ----------
  function detectDelimiter(text) {
    const sample = text.slice(0, 20000);
    const candidates = [",", "\t", ";", "|"];
    let best = ",", bestScore = -1;
    for (const d of candidates) {
      const lines = sample.split(/\r?\n/).filter(Boolean).slice(0, 20);
      if (lines.length < 2) continue;
      const counts = lines.map((l) => l.split(d).length - 1);
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      if (mean === 0) continue;
      const variance = counts.reduce((a, c) => a + (c - mean) ** 2, 0) / counts.length;
      const score = mean / (1 + variance); // consistent and frequent wins
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  function parse(text, delimiter) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    delimiter = delimiter || detectDelimiter(text);
    const rows = [];
    let row = [], field = "", i = 0, inQuotes = false;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === delimiter) { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    // drop fully empty trailing rows
    while (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();
    if (!rows.length) return { headers: [], rows: [], delimiter };
    const headers = rows[0].map((h, idx) => (h.trim() || `column_${idx + 1}`));
    const width = headers.length;
    const data = rows.slice(1).map((r) => {
      const out = r.slice(0, width);
      while (out.length < width) out.push("");
      return out;
    });
    return { headers, rows: data, delimiter };
  }

  // ---------- Type inference ----------
  const NUM_RE = /^[-+]?(\$|€|£)?\s?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
  const BOOL = new Set(["true", "false", "yes", "no", "y", "n", "1", "0"]);
  const DATE_RE = /^(\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{4}|[A-Z][a-z]{2} \d{1,2},? \d{4})$/;

  function toNumber(v) {
    const s = String(v).trim().replace(/[$€£,\s]/g, "").replace(/%$/, "");
    if (s === "" || isNaN(s)) return null;
    return Number(s);
  }
  function toDate(v) {
    const s = String(v).trim();
    if (!DATE_RE.test(s)) return null;
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const d = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(s); // date-only strings are local dates, not UTC
    return isNaN(d) ? null : d;
  }
  const isMissing = (v) => v == null || String(v).trim() === "" || /^(na|n\/a|null|none|-)$/i.test(String(v).trim());

  function inferType(values) {
    const present = values.filter((v) => !isMissing(v));
    if (!present.length) return "empty";
    const sample = present.length > 2000 ? present.filter((_, i) => i % Math.ceil(present.length / 2000) === 0) : present;
    const share = (fn) => sample.filter(fn).length / sample.length;
    if (share((v) => BOOL.has(String(v).trim().toLowerCase())) >= 0.98 && new Set(sample.map((v) => String(v).trim().toLowerCase())).size <= 2) return "boolean";
    if (share((v) => NUM_RE.test(String(v).trim())) >= 0.95) return "number";
    if (share((v) => toDate(v) !== null) >= 0.9) return "date";
    return "string";
  }

  // ---------- Statistics ----------
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function columnStats(values, type) {
    const total = values.length;
    const present = values.filter((v) => !isMissing(v));
    const missing = total - present.length;
    const base = { type, total, missing, missingPct: total ? missing / total : 0, unique: new Set(present.map((v) => String(v).trim())).size };
    if (type === "number") {
      const nums = present.map(toNumber).filter((x) => x !== null).sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = nums.length ? sum / nums.length : null;
      const sd = nums.length > 1 ? Math.sqrt(nums.reduce((a, x) => a + (x - mean) ** 2, 0) / (nums.length - 1)) : null;
      return { ...base, min: nums[0] ?? null, max: nums[nums.length - 1] ?? null, mean, median: quantile(nums, 0.5), p25: quantile(nums, 0.25), p75: quantile(nums, 0.75), sum, sd, histogram: histogram(nums) };
    }
    if (type === "date") {
      const ds = present.map(toDate).filter(Boolean).sort((a, b) => a - b);
      return { ...base, min: ds[0] ?? null, max: ds[ds.length - 1] ?? null, spanDays: ds.length ? Math.round((ds[ds.length - 1] - ds[0]) / 864e5) : null };
    }
    const counts = new Map();
    for (const v of present) { const k = String(v).trim(); counts.set(k, (counts.get(k) || 0) + 1); }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { ...base, top };
  }

  function histogram(nums, bins = 12) {
    if (nums.length < 2) return [];
    const min = nums[0], max = nums[nums.length - 1];
    if (min === max) return [{ from: min, to: max, count: nums.length }];
    const width = (max - min) / bins;
    const out = Array.from({ length: bins }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
    for (const x of nums) { let b = Math.floor((x - min) / width); if (b >= bins) b = bins - 1; out[b].count++; }
    return out;
  }

  // ---------- Aggregation for charts ----------
  function bucketDate(d, granularity) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    if (granularity === "year") return `${y}`;
    if (granularity === "day") return `${y}-${m}-${day}`;
    return `${y}-${m}`;
  }

  function groupBy(rows, xIdx, xType, yIdx, agg, opts = {}) {
    const groups = new Map();
    for (const r of rows) {
      const xv = r[xIdx];
      if (isMissing(xv)) continue;
      let key;
      if (xType === "date") { const d = toDate(xv); if (!d) continue; key = bucketDate(d, opts.granularity || "month"); }
      else key = String(xv).trim();
      const g = groups.get(key) || { count: 0, sum: 0, n: 0, min: Infinity, max: -Infinity };
      g.count++;
      if (yIdx != null) {
        const y = toNumber(r[yIdx]);
        if (y !== null) { g.sum += y; g.n++; if (y < g.min) g.min = y; if (y > g.max) g.max = y; }
      }
      groups.set(key, g);
    }
    let entries = [...groups.entries()].map(([label, g]) => {
      let value;
      switch (agg) {
        case "sum": value = g.sum; break;
        case "avg": value = g.n ? g.sum / g.n : 0; break;
        case "min": value = g.n ? g.min : 0; break;
        case "max": value = g.n ? g.max : 0; break;
        default: value = g.count;
      }
      return { label, value };
    });
    if (xType === "date") entries.sort((a, b) => a.label.localeCompare(b.label));
    else { entries.sort((a, b) => b.value - a.value); if (entries.length > (opts.limit || 20)) entries = entries.slice(0, opts.limit || 20); }
    return entries;
  }

  // ---------- Export ----------
  function serialize(headers, rows, delimiter = ",") {
    const esc = (v) => { const s = String(v ?? ""); return /["\n\r]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [headers, ...rows].map((r) => r.map(esc).join(delimiter)).join("\n");
  }

  return { parse, detectDelimiter, inferType, columnStats, groupBy, serialize, toNumber, toDate, isMissing };
})();
if (typeof module !== "undefined") module.exports = CSV;
