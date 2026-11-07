/**
 * VALIDATION — the evidence. Two charts recompute live for the current scenario;
 * everything else is read from the pipeline's metrics.json (fixed default scenario).
 */
import { html, mount, $ } from "../ui/dom.js";
import { LineChart } from "../ui/charts/LineChart.js";
import { BarChart } from "../ui/charts/BarChart.js";
import { greedy, curve, standaloneOrder } from "../core/model.js";
import { pct } from "../ui/format.js";

const BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens"];

export function ValidationView(root, { engine, data }) {
  const M = data.metrics;
  const b20 = M.baselines.K20, oos = M.out_of_sample, bs = M.bootstrap, cg = M.current_gap;

  mount(root, html`<div class="view-pad"><div class="val">
    <div class="val-hero">
      <div class="panel finding enter" style="--i:0">
        <span class="label"><span class="tick amber"></span>Primary finding</span>
        <h2>Upgrading the busiest inaccessible stations first delivers <em>just over half</em> the access benefit of an optimised plan.</h2>
        <p>${M.setup.n_candidates} of ${M.setup.n_complexes} subway complexes lack step-free access on at least one route. Riders entering on those routes average ${cg.entry_weighted_mean_gap_km.toFixed(2)} km (straight line) to the nearest step-free station on the same route, and ${pct(cg.share_unmet_demand_gap_over_1km, 0)} face more than 1 km.</p>
        <p>Ranking by ridership ignores whether a step-free station already sits nearby on the same line. Treating the choice as a facility-location problem closes ${pct(b20.greedy)} of the gap with 20 upgrades, against ${pct(b20.busiest_first)} for busiest-first.</p>
      </div>
      <div class="panel enter" style="--i:1">
        <div class="panel-head"><span class="label">Headline evidence · K = 20</span><span class="meta">PIPELINE OUTPUT</span></div>
        <div class="readouts">
          <div class="readout"><span class="v amber">${pct(b20.greedy)}</span><span class="d">gap closed by the optimiser</span></div>
          <div class="readout"><span class="v">${b20.busiest_first_upgrades_to_match}</span><span class="d">upgrades busiest-first needs to match (vs 20)</span></div>
          <div class="readout"><span class="v cyan">${pct(oos.reduction_greedy_trained_on_aug)}</span><span class="d">out of sample: August plan scored on September</span></div>
          <div class="readout"><span class="v">${bs.greedy_top20_selected_in_ge_90pct}/20</span><span class="d">picks kept in ≥ 90% of 200 bootstrap resamples</span></div>
        </div>
      </div>
    </div>

    <div class="val-grid">
      <div class="panel enter" style="--i:2">
        <div class="panel-head"><span class="label">Strategy comparison</span><span class="meta">LIVE · CURRENT SCENARIO</span></div>
        <div class="card-body">
          <p class="card-q">Does optimised sequencing beat simple rules?</p>
          <div class="chart-legend">
            <span><i style="background:#4fd1ff"></i>StepFree optimiser</span><span><i style="background:#ffb547"></i>Busiest first</span>
            <span><i style="background:#8ea8ff"></i>Stand-alone score</span><span><i class="band"></i>Random order, 5–95%</span>
          </div>
          <div class="chart" id="chCurve"></div>
          <p class="card-p">Each line adds one upgrade at a time. The stand-alone score ranks stations by their own benefit and ignores overlap between nearby upgrades; the optimiser accounts for it.</p>
        </div>
      </div>
      <div class="panel enter" style="--i:3">
        <div class="panel-head"><span class="label">Equity</span><span class="meta">LIVE · CURRENT SCENARIO</span></div>
        <div class="card-body">
          <p class="card-q">Who gets the upgrades?</p>
          <div class="chart-legend"><span><i style="background:#4b5b66;height:8px"></i>Gap today</span><span><i style="background:#4fd1ff;height:8px"></i>After plan</span></div>
          <div class="chart" id="chBorough" style="height:230px"></div>
          <div class="tbl-wrap"><table class="grid">
            <thead><tr><th>Borough guarantee (K = 20)</th><th class="n">Gap closed</th><th class="n">Cost</th><th class="n">Bronx upgrades</th></tr></thead>
            <tbody><tr><td class="strong">None</td><td class="n">${pct(b20.greedy)}</td><td class="n">—</td><td class="n">0</td></tr>
            ${Object.entries(M.equity_floor).map(([k, v]) => html`<tr><td class="strong">At least ${k.split("_")[1]} per borough</td><td class="n">${pct(v.reduction)}</td><td class="n">−${(100 * v.cost_vs_unconstrained_pct_points).toFixed(2)} pts</td><td class="n">${v.bronx_upgrades}</td></tr>`)}</tbody>
          </table></div>
        </div>
      </div>
      <div class="panel enter" style="--i:4">
        <div class="panel-head"><span class="label">Optimality</span><span class="verdict">Proven optimal</span></div>
        <div class="card-body">
          <p class="card-q">Is the greedy answer actually optimal?</p>
          <p class="card-p">The objective is monotone submodular, so greedy is guaranteed at least 63% of the optimum. We also solved the exact mixed-integer program (SciPy / HiGHS) at each budget.</p>
          <div class="tbl-wrap"><table class="grid">
            <thead><tr><th>Budget K</th><th class="n">Greedy</th><th class="n">Exact optimum</th><th class="n">Same sites</th><th class="n">Solve time</th></tr></thead>
            <tbody>${Object.entries(M.milp).map(([k, v]) => html`<tr><td class="strong">${k.slice(1)}</td><td class="n">${pct(v.greedy_reduction)}</td><td class="n">${pct(v.optimal_reduction)}</td><td class="n">${v.overlap}/${k.slice(1)}</td><td class="n">${v.seconds.toFixed(2)} s</td></tr>`)}</tbody>
          </table></div>
        </div>
      </div>
      <div class="panel enter" style="--i:5">
        <div class="panel-head"><span class="label">Chronological hold-out</span><span class="verdict">Holds out of sample</span></div>
        <div class="card-body">
          <p class="card-q">Would a plan made earlier still hold?</p>
          <div class="chart" id="chOos" style="height:210px"></div>
          <p class="card-p">Plan on August weekdays only, score on September (Labor Day excluded). Station ridership ranks correlate at Spearman ρ = ${oos.spearman_station_weights_aug_vs_sep.toFixed(3)} across months; the August plan shares ${oos.overlap_aug_plan_vs_sep_oracle} of 20 sites with the September oracle.</p>
        </div>
      </div>
      <div class="panel enter" style="--i:6">
        <div class="panel-head"><span class="label">Robustness</span><span class="meta">TOP-20 OVERLAP WITH DEFAULT</span></div>
        <div class="card-body">
          <p class="card-q">How sensitive is the top 20 to our assumptions?</p>
          <div class="tbl-wrap"><table class="grid">
            <thead><tr><th>Change from default</th><th class="n">Overlap</th></tr></thead>
            <tbody>
              <tr><td class="strong">Bootstrap: 200 weekday resamples (mean selection frequency)</td><td class="n">${pct(bs.greedy_top20_mean_selection_freq, 0)}</td></tr>
              ${Object.entries(M.sensitivity_top20_overlap).map(([k, v]) => html`<tr><td class="strong">${k.replace(/_/g, " ")}</td><td class="n">${v.overlap_of_20}/20</td></tr>`)}
            </tbody>
          </table></div>
          <p class="card-p">Stable to demand noise, weather and distance caps. The route rule changes the list substantially; it is a policy choice, so the planner exposes it as a switch instead of hiding it.</p>
        </div>
      </div>
      <div class="panel enter" style="--i:7">
        <div class="panel-head"><span class="label">Statistical note</span><span class="meta">DESCRIPTIVE</span></div>
        <div class="card-body">
          <p class="card-q">Do boroughs differ in today's gap?</p>
          <p class="card-p">Kruskal–Wallis on station-level gaps (complexes with unmet routes): H = ${M.borough_kruskal_wallis.H.toFixed(1)}, p = ${M.borough_kruskal_wallis.p_value.toFixed(4)}. Stations are spatially correlated, so they are not independent observations; treat this as descriptive, not confirmatory.</p>
          <div class="tbl-wrap"><table class="grid">
            <thead><tr><th>Borough</th><th class="n">Entries at step-free</th><th class="n">No step-free</th><th class="n">Weighted gap</th></tr></thead>
            <tbody>${M.borough_equity.map((e) => html`<tr><td class="strong">${e.borough}</td><td class="n">${pct(e.share_entries_full_step_free)}</td><td class="n">${pct(e.share_complexes_no_step_free)}</td><td class="n">${e.entry_weighted_gap_km.toFixed(2)} km</td></tr>`)}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  </div></div>`);

  const kmFmt = (v, full) => (full ? `${v.toFixed(2)} km` : v.toFixed(1));
  const curveChart = new LineChart($("#chCurve", root), {
    xLabel: "Stations upgraded (K)", yLabel: "Gap closed", yFormat: (v, full) => (full ? `${v.toFixed(1)}%` : `${v.toFixed(0)}%`),
  });
  const boroughChart = new BarChart($("#chBorough", root), { orientation: "h", format: kmFmt, axisLabel: "Ridership-weighted gap (km)" });
  const oosChart = new BarChart($("#chOos", root), { orientation: "v", format: (v, full) => (full ? `${v.toFixed(1)}%` : `${v.toFixed(0)}%`), max: 40 });
  let oosDrawn = false;

  function liveCurves(res, state) {
    const { p } = res;
    const K = 50;
    const B0 = res.kpi.B0;
    const pool = p.cands.filter((c) => !state.exclude.has(c));
    const opt = greedy(p, K, { mode: state.mode, T: state.T, floor: state.floor, groups: engine.groups, exclude: state.exclude }).map((x) => x.j);
    const toPct = (c) => c.map((v) => 100 * (1 - v / B0));
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const draws = [];
    for (let d = 0; d < 200; d++) {
      const a = pool.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      draws.push(toPct(curve(p, a, K)));
    }
    const q = (k, f) => { const v = draws.map((d) => d[k]).sort((a, b) => a - b); return v[Math.floor(f * (v.length - 1))]; };
    const xs = Array.from({ length: K + 1 }, (_, i) => i);
    return {
      x: xs,
      band: { lo: xs.map((k) => q(k, 0.05)), hi: xs.map((k) => q(k, 0.95)) },
      series: [
        { key: "stand", label: "Stand-alone", color: "#8ea8ff", width: 1.6, values: toPct(curve(p, standaloneOrder(p, pool), K)), delay: 200 },
        { key: "busy", label: "Busiest first", color: "#ffb547", width: 1.8, values: toPct(curve(p, res.busiest, K)), delay: 100 },
        { key: "opt", label: "StepFree", color: "#4fd1ff", width: 2.4, glow: true, values: toPct(curve(p, opt, K)), delay: 0 },
      ],
      marker: Math.min(state.K, K), markerLabel: `K = ${state.K}`,
      hoverTitle: (k) => `${k} upgrade${k === 1 ? "" : "s"}`,
      ariaLabel: "Share of the access gap closed as stations are upgraded, for four strategies",
    };
  }

  return {
    update(state, res) {
      curveChart.update(liveCurves(res, state));
      const g1 = res.after, p = res.p;
      const wg = (g, b) => { let a = 0, w = 0; for (let i = 0; i < p.n; i++) if (engine.groups[i] === b) { a += p.u[i] * g[i]; w += p.u[i]; } return w ? a / w : 0; };
      const nUp = (b) => res.picks.filter((j) => engine.groups[j] === b).length;
      boroughChart.update({
        categories: BOROUGHS,
        series: [
          { label: "Gap today", color: "#4b5b66", values: BOROUGHS.map((b) => wg(p.d0, b)) },
          { label: "After plan", color: "#4fd1ff", values: BOROUGHS.map((b) => wg(g1, b)), labels: BOROUGHS.map((b) => `${wg(g1, b).toFixed(2)} km · ${nUp(b)} up`) },
        ],
        ariaLabel: "Ridership-weighted gap by borough, today and after the plan",
      });
      if (!oosDrawn) {
        oosChart.update({
          categories: ["Busiest-first (Aug)", "StepFree (Aug)", "Oracle (Sep)"],
          series: [{ label: "Gap closed on September data", colors: ["#ffb547", "#4fd1ff", "#4b5b66"],
            values: [oos.reduction_busiest_first_aug, oos.reduction_greedy_trained_on_aug, oos.reduction_oracle_trained_on_sep].map((v) => 100 * v) }],
          ariaLabel: "Out-of-sample gap reduction on September data",
        });
        oosDrawn = true;
      }
    },
  };
}
