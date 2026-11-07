/**
 * Scenario parameters (left rail). Every control maps 1:1 to a model input;
 * nothing here is decorative.
 */
import { html, mount, $ } from "../dom.js";
import { segmented, syncRange } from "../controls.js";
import { shortName } from "../format.js";
import { DEFAULTS } from "../../core/scenario.js";

export function ScenarioPanel(root, store, stations) {
  mount(root, html`
    <div class="panel-head"><span class="label"><span class="tick"></span>Scenario</span><span class="meta">MODEL INPUT</span></div>
    <div class="rail-body">
      <div class="ctl">
        <div class="ctl-row"><label class="ctl-name" for="k">Upgrade budget</label><span class="ctl-value" id="kOut">20</span></div>
        <input class="range" id="k" type="range" min="1" max="50" step="1" aria-describedby="kHelp">
        <div class="scale"><span>1</span><span>25</span><span>50</span></div>
        <span class="ctl-help" id="kHelp">Station complexes made step-free in this capital cycle.</span>
      </div>

      <div class="ctl">
        <span class="ctl-name">Objective</span>
        <div class="seg" id="mode" role="group" aria-label="Objective">
          <span class="seg-plate"></span>
          <button data-value="gap">Shrink detour</button>
          <button data-value="coverage">Coverage</button>
        </div>
        <span class="ctl-help" id="modeHelp"></span>
        <div class="select" id="tWrap" hidden>
          <select id="t" aria-label="Coverage distance">
            <option value="0.5">Step-free option within 0.5 km</option>
            <option value="0.8">Step-free option within 0.8 km</option>
            <option value="1">Step-free option within 1.0 km</option>
          </select>
        </div>
      </div>

      <div class="ctl">
        <label class="ctl-name" for="floor">Borough guarantee</label>
        <div class="select"><select id="floor">
          <option value="0">None: pure efficiency</option>
          <option value="1">At least 1 per borough</option>
          <option value="2">At least 2 per borough</option>
          <option value="3">At least 3 per borough</option>
        </select></div>
      </div>

      <div class="ctl">
        <label class="ctl-name" for="weight">Demand basis</label>
        <div class="select"><select id="weight">
          <option value="w_weekday">Weekday entries · Aug–Sep 2025</option>
          <option value="w_weekday_dry">Dry weekdays only (NOAA)</option>
          <option value="w_weekend">Weekend entries</option>
          <option value="w_weekday_aug">August weekdays</option>
          <option value="w_weekday_sep">September weekdays</option>
        </select></div>
      </div>

      <label class="switch">
        <span class="ctl-name">Same-route alternative</span>
        <input type="checkbox" id="same"><span class="track" aria-hidden="true"></span>
        <span class="ctl-help">A step-free station only counts if it serves a route the rider needs.</span>
      </label>
      <label class="switch">
        <span class="ctl-name">Count one-direction access</span>
        <input type="checkbox" id="lenient"><span class="track" aria-hidden="true"></span>
        <span class="ctl-help">Treat platforms step-free in one direction only (ADA = 2) as accessible.</span>
      </label>

      <div class="ctl" id="exclWrap" hidden>
        <span class="ctl-name">Excluded sites</span>
        <div class="chips" id="excl"></div>
      </div>
    </div>
    <div class="rail-foot"><button class="btn" id="reset" type="button">Reset scenario</button></div>`);

  const k = $("#k", root), kOut = $("#kOut", root);
  const setMode = segmented($("#mode", root), store.get().mode, (v) => store.set({ mode: v }));

  k.addEventListener("input", () => { syncRange(k); kOut.textContent = k.value; store.set({ K: +k.value }); });
  $("#t", root).addEventListener("change", (e) => store.set({ T: +e.target.value }));
  $("#floor", root).addEventListener("change", (e) => store.set({ floor: +e.target.value }));
  $("#weight", root).addEventListener("change", (e) => store.set({ weight: e.target.value }));
  $("#same", root).addEventListener("change", (e) => store.set({ sameRoute: e.target.checked }));
  $("#lenient", root).addEventListener("change", (e) => store.set({ lenient: e.target.checked }));
  $("#reset", root).addEventListener("click", () => store.set({ ...DEFAULTS, exclude: new Set(), selected: null }));
  $("#excl", root).addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    const ex = new Set(store.get().exclude); ex.delete(+b.dataset.i); store.set({ exclude: ex });
  });

  function sync(s) {
    k.value = s.K; kOut.textContent = s.K; syncRange(k);
    setMode(s.mode);
    $("#modeHelp", root).textContent = s.mode === "gap"
      ? "Minimise ridership-weighted distance to the nearest step-free station on a needed route."
      : "Maximise entries whose nearest same-route step-free station is within the chosen distance.";
    $("#tWrap", root).hidden = s.mode !== "coverage";
    $("#t", root).value = String(s.T);
    $("#floor", root).value = String(s.floor);
    $("#weight", root).value = s.weight;
    $("#same", root).checked = s.sameRoute;
    $("#lenient", root).checked = s.lenient;
    $("#exclWrap", root).hidden = s.exclude.size === 0;
    mount($("#excl", root), html`${[...s.exclude].map((i) => html`<span class="chip">${shortName(stations[i].name)}<button type="button" data-i="${i}" aria-label="Return ${shortName(stations[i].name)} to the candidate pool">×</button></span>`)}`);
  }
  sync(store.get());
  return { sync };
}
