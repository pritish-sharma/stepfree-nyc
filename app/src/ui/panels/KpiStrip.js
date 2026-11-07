/** Scenario readouts. Values animate only when the scenario changes. */
import { html, mount, $ } from "../dom.js";
import { countTo } from "../motion.js";
import { fmtK, fmtInt } from "../format.js";

export function KpiStrip(root) {
  mount(root, html`
    <div class="panel kpi enter" style="--i:1">
      <span class="label">Access gap closed</span>
      <div class="kpi-val accent"><span id="kGap">0%</span></div>
      <div class="kpi-meter"><i id="kGapBar"></i></div>
      <span class="kpi-sub" id="kGapSub"></span>
    </div>
    <div class="panel kpi enter" style="--i:2">
      <span class="label">vs busiest-first</span>
      <div class="kpi-val amber"><span id="kBase">+0%</span><small>more</small></div>
      <div class="kpi-meter"><i class="ghost" id="kBaseBar"></i></div>
      <span class="kpi-sub" id="kBaseSub"></span>
    </div>
    <div class="panel kpi enter" style="--i:3">
      <span class="label">Avg. detour</span>
      <div class="kpi-val"><span id="kKm">0.00</span><small>km</small></div>
      <div class="kpi-meter"><i id="kKmBar"></i></div>
      <span class="kpi-sub" id="kKmSub"></span>
    </div>
    <div class="panel kpi enter" style="--i:4">
      <span class="label" id="kCovLabel">Step-free ≤ 0.8 km</span>
      <div class="kpi-val"><span id="kCov">0%</span><small>of riders</small></div>
      <div class="kpi-meter"><i id="kCovBar"></i></div>
      <span class="kpi-sub" id="kCovSub"></span>
    </div>`);

  return {
    update(kpi, K) {
      countTo($("#kGap", root), 100 * kpi.reduction, (v) => `${v.toFixed(1)}%`);
      $("#kGapBar", root).style.width = `${(100 * kpi.reduction).toFixed(1)}%`;
      $("#kGapSub", root).textContent = `Access Gap Index ${fmtK(kpi.B0)} → ${fmtK(kpi.B1)} entry-km/day · ${K} upgrades`;

      countTo($("#kBase", root), 100 * kpi.extraVsBusiest, (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}%`);
      $("#kBaseBar", root).style.width = `${(100 * kpi.busiestReduction).toFixed(1)}%`;
      $("#kBaseSub", root).innerHTML = `Busiest-first closes ${(100 * kpi.busiestReduction).toFixed(1)}%` +
        (kpi.busiestToMatch ? `; needs <b>${kpi.busiestToMatch}</b> upgrades to match` : "; cannot match within 150");

      countTo($("#kKm", root), kpi.meanGap1, (v) => v.toFixed(2));
      $("#kKmBar", root).style.width = `${Math.min(100, (100 * kpi.meanGap1) / 1.5).toFixed(1)}%`;
      $("#kKmSub", root).innerHTML = `from ${kpi.meanGap0.toFixed(2)} km today for riders on routes without step-free access`;

      $("#kCovLabel", root).textContent = `Step-free ≤ ${kpi.T} km`;
      countTo($("#kCov", root), 100 * kpi.cov1, (v) => `${v.toFixed(0)}%`);
      $("#kCovBar", root).style.width = `${(100 * kpi.cov1).toFixed(1)}%`;
      $("#kCovSub", root).innerHTML = `from ${(100 * kpi.cov0).toFixed(0)}% today · <b>+${fmtInt(kpi.covGainEntries / 1000)}k</b> entries/day`;
    },
  };
}
