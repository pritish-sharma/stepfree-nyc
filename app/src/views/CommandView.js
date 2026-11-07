/**
 * COMMAND — the planning workspace: scenario rail, geospatial core with KPI
 * instruments, and the sequence / dossier column. This view owns no model logic;
 * it renders the engine's output for the current store state.
 */
import { html, mount, $ } from "../ui/dom.js";
import { MapView } from "../ui/map/MapView.js";
import { LAYERS, rampCss } from "../ui/map/layers.js";
import { segmented } from "../ui/controls.js";
import { ScenarioPanel } from "../ui/panels/ScenarioPanel.js";
import { KpiStrip } from "../ui/panels/KpiStrip.js";
import { SequencePanel } from "../ui/panels/SequencePanel.js";
import { DossierPanel } from "../ui/panels/DossierPanel.js";
import { showTooltip, hideTooltip } from "../ui/tooltip.js";
import { fmtInt, shortName } from "../ui/format.js";

export function CommandView(root, { store, engine, data }) {
  const stations = engine.stations;
  mount(root, html`
    <div class="command">
      <aside class="panel rail enter" style="--i:0" id="rail" aria-label="Scenario parameters"></aside>
      <section class="core" aria-label="Geospatial core">
        <div class="kpis" id="kpis"></div>
        <div class="panel stage enter" style="--i:5" id="stage">
          <div class="map-ui map-layers">
            <div class="seg" id="layer" role="group" aria-label="Map layer">
              <span class="seg-plate"></span>
              ${Object.entries(LAYERS).map(([k, L]) => html`<button data-value="${k}">${L.label}</button>`)}
            </div>
          </div>
          <div class="map-ui map-readout" aria-hidden="true">
            <div>CURSOR <b id="cursor">—</b></div>
            <div>COMPLEXES <b>${stations.length}</b> · DATA <b>HISTORICAL 2025</b></div>
          </div>
          <div class="map-ui map-legend" id="legend"></div>
          <div class="map-ui map-zoom">
            <button class="btn icon-btn" id="zin" type="button" aria-label="Zoom in">+</button>
            <button class="btn icon-btn" id="zout" type="button" aria-label="Zoom out">−</button>
            <button class="btn icon-btn" id="zfit" type="button" aria-label="Fit city" style="font-size:11px">⤢</button>
          </div>
        </div>
      </section>
      <aside class="panel side enter" style="--i:6" aria-label="Recommended sequence and station dossier">
        <div class="side-stack">
          <div class="side-pane" id="seqPane"></div>
          <div class="side-pane off-right" id="dosPane"></div>
        </div>
      </aside>
    </div>`);

  const scenario = ScenarioPanel($("#rail", root), store, stations);
  const kpis = KpiStrip($("#kpis", root));
  const select = (i, fly = true) => store.set({ selected: i, _fly: fly ? Symbol() : null });
  const seq = SequencePanel($("#seqPane", root), {
    stations,
    onSelect: (i) => select(i),
    onHoverRow: (i) => { map.hover = i; map.invalidate(); },
  });
  const dossier = DossierPanel($("#dosPane", root), {
    stations,
    onBack: () => store.set({ selected: null }),
    onSelect: (i) => select(i),
    onToggleExclude: (i) => {
      const ex = new Set(store.get().exclude);
      ex.has(i) ? ex.delete(i) : ex.add(i);
      store.set({ exclude: ex });
    },
  });

  const cursorEl = $("#cursor", root);
  const map = new MapView($("#stage", root), {
    stations,
    segments: data.segments,
    onSelect: (i) => select(i, false),
    onCursor: (lat, lon) => { cursorEl.textContent = `${lat.toFixed(4)}°N ${Math.abs(lon).toFixed(4)}°W`; },
    onHover: (i, x, y) => {
      if (i == null) return hideTooltip();
      const s = stations[i], r = current;
      if (!r) return;
      const rank = r.rankOf.get(i);
      showTooltip(`<div class="t-title">${shortName(s.name)}</div>
        <div class="t-row"><span>${s.borough}</span><b>${fmtInt(s.w_weekday)} / weekday</b></div>
        ${r.p.u[i] > 0 ? `<div class="t-row"><span>Gap today</span><b>${r.p.d0[i].toFixed(2)} km</b></div>
        <div class="t-row"><span>After plan</span><b>${r.after[i].toFixed(2)} km</b></div>` : `<div class="t-row"><span>Status</span><b>step-free</b></div>`}
        ${rank != null ? `<div class="t-flag">Recommended upgrade #${rank + 1}</div>` : ""}`, x, y);
    },
  });

  const setLayer = segmented($("#layer", root), store.get().layer, (v) => store.set({ layer: v }));
  $("#zin", root).addEventListener("click", () => map.zoomBy(1.5));
  $("#zout", root).addEventListener("click", () => map.zoomBy(1 / 1.5));
  $("#zfit", root).addEventListener("click", () => map.resetView());

  // percentiles for the street-context layer (computed once)
  const streetVal = stations.map((s) => s.c311_sidewalk + s.c311_curb + s.c311_ramp);
  const sorted = streetVal.slice().sort((a, b) => a - b);
  const streetPct = streetVal.map((v) => sorted.filter((x) => x <= v).length / sorted.length);

  let current = null;
  function renderLegend(layer) {
    const L = LAYERS[layer];
    const lg = L.legend();
    const base = lg.items
      ? lg.items.map(([t, c]) => `<div class="lg"><i style="background:${c}"></i>${t}</div>`).join("")
      : `<div class="ramp" style="background:${rampCss(lg.ramp)}"></div><div class="ramp-scale">${lg.domain.map((d) => `<span>${d}</span>`).join("")}</div>`;
    $("#legend", root).innerHTML = `<span class="label" style="font-size:10px">${L.label}</span><p class="legend-note">${L.note}</p>${base}
      <div class="lg"><i class="ring"></i>Recommended upgrade</div>
      <div class="lg"><i class="line"></i>Line sequence (schematic)</div>
      <div class="lg" style="color:var(--text-2)">Dot size = weekday entries</div>`;
  }

  return {
    update(state, res, keys, isDefault) {
      current = res;
      if (keys.has("layer") || !this._legend) { renderLegend(state.layer); setLayer(state.layer); map.setLayer(state.layer); this._legend = true; }
      const modelKeys = ["K", "mode", "T", "floor", "weight", "sameRoute", "lenient", "exclude", "_init"];
      const modelChanged = modelKeys.some((k) => keys.has(k));
      if (modelChanged) {
        scenario.sync(state);
        kpis.update(res.kpi, state.K);
        map.setScenario({ ...res, stations, streetPct, exclude: state.exclude });
      }
      if (modelChanged || keys.has("selected")) {
        const sel = state.selected;
        $("#seqPane", root).classList.toggle("off-left", sel != null);
        $("#dosPane", root).classList.toggle("off-right", sel == null);
        if (sel != null) dossier.render(sel, res, { ...state, isDefault });
        if (modelChanged || sel == null) seq.update(res, state, isDefault);
        seq.highlight(sel);
        map.setSelected(sel, { fly: keys.has("_fly") && state._fly != null });
      }
    },
    intro() { map.intro(); },
    onShow() { map.resize(); },
  };
}
