/**
 * DATA EXPLORER — every station complex with its inputs and the current
 * scenario's outputs. Search, filter, sort; click a row to open it on the map.
 */
import { html, mount, raw, $ } from "../ui/dom.js";
import { fmtInt, shortName } from "../ui/format.js";

const COLS = [
  { key: "name", label: "Station complex", get: (r) => r.s.name, text: true },
  { key: "borough", label: "Borough", get: (r) => r.s.borough, text: true },
  { key: "status", label: "Status", get: (r) => r.s.status, text: true },
  { key: "w", label: "Weekday entries", get: (r) => r.s.w_weekday },
  { key: "u", label: "On unmet routes", get: (r) => r.u },
  { key: "gap", label: "Gap now (km)", get: (r) => r.gap },
  { key: "after", label: "After plan (km)", get: (r) => r.after },
  { key: "rank", label: "Plan rank", get: (r) => (r.rank == null ? 9999 : r.rank) },
  { key: "street", label: "311 sidewalk+curb", get: (r) => r.s.c311_sidewalk + r.s.c311_curb },
  { key: "crash", label: "Crashes ≤400 m", get: (r) => r.s.crashes },
];
const STATUS = { full: "Step-free", partial: "Partial", none: "None" };

export function ExplorerView(root, { engine, data, onOpen }) {
  const prof = data.profile;
  const stations = engine.stations;
  let rows = [];
  let sort = { key: "rank", dir: 1 };
  let filter = { q: "", borough: "", status: "" };

  mount(root, html`<div class="view-pad"><div class="explorer">
    <div class="panel enter" style="--i:0">
      <div class="panel-head"><span class="label"><span class="tick"></span>Data audit</span><span class="meta">HISTORICAL · 2025-08-01 → 2025-09-30</span></div>
      <div class="audit">
        <div><span class="label">MTA ridership</span><span class="v">${fmtInt(prof.ridership.rows)}</span><span class="d">complex-days · ${prof.ridership.complexes} complexes · ${prof.ridership.days} days · ${prof.ridership.duplicate_complex_days} duplicate keys</span></div>
        <div><span class="label">Accessibility join</span><span class="v">${prof.join.matched_to_accessibility}/${prof.join.ridership_complexes}</span><span class="d">complexes matched; ${prof.join.accessibility_complexes_without_ridership} Staten Island Railway stations have no ridership</span></div>
        <div><span class="label">NOAA weather</span><span class="v">${prof.weather.wet_days_ge_2_5mm}</span><span class="d">wet days (≥ 2.5 mm, 3-station mean) · used for the dry-day robustness check</span></div>
        <div><span class="label">DOT 311 requests</span><span class="v">${fmtInt(prof["311"].rows)}</span><span class="d">${fmtInt(prof["311"].missing_coords)} without coordinates dropped from spatial counts</span></div>
        <div><span class="label">NYPD collisions</span><span class="v">${fmtInt(prof.crashes.rows)}</span><span class="d">${prof.crashes.missing_or_invalid_coords} with missing or out-of-NYC coordinates dropped</span></div>
      </div>
    </div>
    <div class="panel enter" style="--i:1">
      <div class="filters">
        <label class="search"><svg viewBox="0 0 16 16" fill="none" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="M11 11l4 4"/></svg>
          <span class="sr-only">Search stations</span><input id="q" type="search" placeholder="Search station or route…" autocomplete="off"></label>
        <div class="select"><select id="fb" aria-label="Borough"><option value="">All boroughs</option>${["Bronx", "Brooklyn", "Manhattan", "Queens"].map((b) => html`<option>${b}</option>`)}</select></div>
        <div class="select"><select id="fs" aria-label="Status"><option value="">Any status</option><option value="none">No step-free</option><option value="partial">Partly step-free</option><option value="full">Step-free</option></select></div>
        <span class="count" id="count"></span>
      </div>
      <div class="tbl-wrap"><table class="grid" aria-label="Station complexes">
        <thead><tr>${COLS.map((c) => html`<th class="sortable${c.text ? "" : " n"}" data-key="${c.key}" scope="col" tabindex="0">${c.label}<span class="arrow"></span></th>`)}</tr></thead>
        <tbody id="tb"></tbody>
      </table></div>
    </div>
  </div></div>`);

  const tb = $("#tb", root);
  $("#q", root).addEventListener("input", (e) => { filter.q = e.target.value.trim().toLowerCase(); draw(); });
  $("#fb", root).addEventListener("change", (e) => { filter.borough = e.target.value; draw(); });
  $("#fs", root).addEventListener("change", (e) => { filter.status = e.target.value; draw(); });
  const sortBy = (th) => {
    const k = th.dataset.key;
    sort = { key: k, dir: sort.key === k ? -sort.dir : COLS.find((c) => c.key === k).text || k === "rank" ? 1 : -1 };
    draw();
  };
  root.querySelector("thead").addEventListener("click", (e) => { const th = e.target.closest("th"); if (th) sortBy(th); });
  root.querySelector("thead").addEventListener("keydown", (e) => { const th = e.target.closest("th"); if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sortBy(th); } });
  tb.addEventListener("click", (e) => { const tr = e.target.closest("tr[data-i]"); if (tr) onOpen(+tr.dataset.i); });
  tb.addEventListener("keydown", (e) => { const tr = e.target.closest("tr[data-i]"); if (tr && e.key === "Enter") onOpen(+tr.dataset.i); });

  function draw() {
    const col = COLS.find((c) => c.key === sort.key);
    const shown = rows.filter((r) =>
      (!filter.borough || r.s.borough === filter.borough) &&
      (!filter.status || r.s.status === filter.status) &&
      (!filter.q || r.s.name.toLowerCase().includes(filter.q) || r.s.routes.toLowerCase().split(" ").includes(filter.q)))
      .sort((a, b) => {
        const x = col.get(a), y = col.get(b);
        return (col.text ? String(x).localeCompare(String(y)) : x - y) * sort.dir;
      });
    for (const th of root.querySelectorAll("th")) {
      const active = th.dataset.key === sort.key;
      th.querySelector(".arrow").textContent = active ? (sort.dir > 0 ? "▲" : "▼") : "";
      th.setAttribute("aria-sort", active ? (sort.dir > 0 ? "ascending" : "descending") : "none");
    }
    $("#count", root).textContent = `${shown.length} of ${rows.length} complexes`;
    mount(tb, shown.length ? html`${shown.map((r) => html`<tr class="clickable" data-i="${r.i}" tabindex="0">
      <td class="strong">${shortName(r.s.name)}</td><td>${r.s.borough}</td><td>${STATUS[r.s.status]}</td>
      <td class="n">${fmtInt(r.s.w_weekday)}</td><td class="n">${fmtInt(r.u)}</td>
      <td class="n">${r.u > 0 ? r.gap.toFixed(2) : "—"}</td><td class="n">${r.u > 0 ? r.after.toFixed(2) : "—"}</td>
      <td class="n">${r.rank == null ? "—" : raw(`<span class="rank-pill">#${r.rank + 1}</span>`)}</td>
      <td class="n">${r.s.c311_sidewalk + r.s.c311_curb}</td><td class="n">${r.s.crashes}</td></tr>`)}`
      : raw(`<tr><td colspan="${COLS.length}"><div class="empty"><b>No matches</b>Try a different search or clear the filters.</div></td></tr>`));
  }

  return {
    update(state, res) {
      rows = stations.map((s, i) => ({ s, i, u: res.p.u[i], gap: res.p.d0[i], after: res.after[i], rank: res.rankOf.get(i) }));
      draw();
    },
  };
}
