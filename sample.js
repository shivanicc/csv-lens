// Deterministic sample dataset (e-commerce orders) so the app can be tried without a file.
const SAMPLE_CSV = (() => {
  let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const countries = ["United States","Singapore","United Kingdom","Germany","India","Australia","Canada","Japan"];
  const categories = ["Electronics","Home","Books","Clothing","Beauty","Sports"];
  const channels = ["web","mobile app","marketplace","retail"];
  const status = ["delivered","delivered","delivered","shipped","returned","cancelled"];
  const rows = [["order_id","order_date","customer_country","category","channel","units","unit_price","discount_pct","status","gift"]];
  const start = new Date("2026-01-01").getTime(), end = new Date("2026-09-30").getTime();
  for (let i = 1; i <= 600; i++) {
    const d = new Date(start + rnd() * (end - start));
    const units = 1 + Math.floor(rnd() * 5);
    const price = (5 + rnd() * 195).toFixed(2);
    const disc = rnd() < 0.3 ? Math.floor(rnd() * 30) : 0;
    const country = rnd() < 0.05 ? "" : pick(countries);
    rows.push([`ORD-${String(10000 + i)}`, d.toISOString().slice(0, 10), country, pick(categories), pick(channels), units, price, disc, pick(status), rnd() < 0.15 ? "true" : "false"]);
  }
  return rows.map((r) => r.join(",")).join("\n");
})();
