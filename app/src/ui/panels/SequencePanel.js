/**
 * Recommended sequence: a closure curve (cumulative share of the gap closed by
 * each successive pick, against busiest-first) and the ranked list itself.
 */
import { html, mount, raw, $ } from "../dom.js";
import { svgEl } from "../charts/svg.js";
import { shortName, fmtInt, pct } from "../format.js";
import { curve } from "../../core/model.js";

export function routeGlyphs(station, accSet) {
  return html`<span class="routes">${station.routes.split(" ").filter(Boolean).map((r) =>
    html`<span class="rt${accSet.has(r) ? "" : " off"}" title="${r}: ${accSet.has(r) ? "step-free" : "not step-free"}">${r}</span>`)}</span>`;
}

export function SequencePanel(root, { stations, onSelect, onHoverRow }) {
  mount(root, html`
    <div class="panel-head"><span class="label"><span class="tick amber"></span>Upgrade sequence</span><span class="meta" id="seqMeta"></span></div>
    <div class="closure">
      <div class="ctl-row"><span class="label" style="font-size:10px">Cumulative gap closed</span>
        <span style="font: 500 10.5px var(--f-mono); color: var(--text-2)"><span style="color:var(--amber)">━</span> plan &nbsp; <span style="color:var(--text-2)">┅</span> busiest-first</span></div>
      <svg id="closure" viewBox="0 0 340 62" preserveAspectRatio="none" aria-label="Cumulative share of the access gap closed by the plan and by busiest-first"></svg>
    </div>
    <div class="seq" id="seq" role="list"></div>`);

  const list = $("#seq", root);
  const svg = $("#closure", root);
  let prevSet = new Set();

  list.addEventListener("click", (e) => { const r = e.target.closest(".seq-row"); if (r) onSelect(+r.dataset.i); });
  list.addEventListener("keydown", (e) => {
    const r = e.target.closest(".seq-row");
    if (!r) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(+r.dataset.i); }
    if (e.key === "ArrowDown") { e.preventDefault(); r.nextElementSibling?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); r.previousElementSibling?.focus(); }
  });
  list.addEventListener("pointerover", (e) => { const r = e.target.closest(".seq-row"); onHoverRow(r ? +r.dataset.i : null); });
  list.addEventListener("pointerleave", () => onHoverRow(null));

  function drawClosure(res, K) {
    const { p, plan, busiest, kpi } = res;
    const B0 = kpi.B0;
    const planCurve = curve(p, plan.map((x) => x.j), K).map((v) => 1 - v / B0);
    const busyCurve = curve(p, busiest, K).map((v) => 1 - v / B0);
    const yMax = Math.max(0.1, planCurve[planCurve.length - 1]) * 1.1;
    const X = (k) => (k / Math.max(1, K)) * 340, Y = (v) => 60 - (v / yMax) * 56;
    svg.replaceChildren();
    for (let k = 1; k <= 3; k++) svgEl("line", { x1: 0, x2: 340, y1: Y((yMax * k) / 3.3), y2: Y((yMax * k) / 3.3), stroke: "rgba(130,200,230,0.07)", "vector-effect": "non-scaling-stroke" }, svg);
    const d = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
    svgEl("path", { d: d(busyCurve), fill: "none", stroke: "#6b7c86", "stroke-width": 1.2, "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke" }, svg);
    svgEl("path", { d: `${d(planCurve)} L340,60 L0,60 Z`, fill: "rgba(255,181,71,0.08)" }, svg);
    svgEl("path", { d: d(planCurve), fill: "none", stroke: "#ffb547", "stroke-width": 1.8, "vector-effect": "non-scaling-stroke" }, svg);
  }

  return {
    update(res, state, isDefault) {
      const { p, plan, busiest, kpi } = res;
      $("#seqMeta", root).textContent = `${plan.length} SITES · ${pct(kpi.reduction)} OF GAP`;
      drawClosure(res, state.K);
      const maxGain = Math.max(1, ...plan.map((x) => x.gapGain));
      const busyRank = new Map(busiest.map((j, k) => [j, k + 1]));
      const nowSet = new Set(plan.map((x) => x.j));
      let fresh = 0;
      mount(list, html`${plan.map((x, k) => {
        const s = stations[x.j];
        const isNew = !prevSet.has(x.j);
        const conf = isDefault && k < 20
          ? html`<span class="conf" title="Share of 200 bootstrap resamples of weekdays in which this complex is in the top 20">bootstrap <b>${Math.round(100 * s.boot_top20_freq)}%</b></span>` : "";
        return html`<div class="seq-row${isNew ? " fresh" : ""}${state.selected === x.j ? " hot" : ""}" role="listitem" tabindex="0" data-i="${x.j}" style="--i:${isNew ? fresh++ : 0}">
          <span class="seq-rank">${String(k + 1).padStart(2, "0")}</span>
          <div><div class="seq-name">${shortName(s.name)}</div>
            <div class="seq-meta">${routeGlyphs(s, p.A[x.j])}<span>${s.borough}</span><span class="num">${fmtInt(s[state.weight])}/day</span></div>
            <div class="seq-meta"><span>gap <span class="num">${p.d0[x.j].toFixed(2)} km</span></span><span>ridership rank <span class="num">#${busyRank.get(x.j) ?? "–"}</span></span>${conf}</div>
          </div>
          <div class="seq-gain"><b>${pct(x.gapGain / kpi.B0)}</b><span>of gap</span></div>
          <div class="seq-bar"><i style="width:${((100 * x.gapGain) / maxGain).toFixed(1)}%"></i></div>
        </div>`;
      })}${plan.length ? "" : raw('<div class="empty"><b>No candidates</b>Every candidate is excluded. Return a site to the pool.</div>')}`);
      prevSet = nowSet;
    },
    highlight(i) { for (const r of list.children) r.classList.toggle("hot", +r.dataset.i === i); },
  };
}
