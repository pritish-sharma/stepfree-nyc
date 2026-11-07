/**
 * Station dossier: everything the model knows about one complex, with the
 * reasoning behind its rank spelled out in plain language.
 */
import { html, mount, raw, $ } from "../dom.js";
import { shortName, fmtInt, pct, ordinal } from "../format.js";
import { routeGlyphs } from "./SequencePanel.js";

const STATUS = { full: ["Step-free", "#4fd1ff"], partial: ["Partly step-free", "#8ea8ff"], none: ["No step-free access", "#4b5b66"] };

export function DossierPanel(root, { stations, onBack, onToggleExclude, onSelect }) {
  const n = stations.length;
  const pctRank = (col, v) => stations.filter((s) => s[col] <= v).length / n;

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) onBack();
    const ex = e.target.closest("[data-exclude]");
    if (ex) onToggleExclude(+ex.dataset.exclude);
    const go = e.target.closest("[data-goto]");
    if (go) { e.preventDefault(); onSelect(+go.dataset.goto); }
  });

  return {
    render(i, res, state) {
      const s = stations[i];
      const { p, plan, rankOf, busiest, kpi } = res;
      const rank = rankOf.get(i);
      const pick = rank != null ? plan[rank] : null;
      const alt = p.alt0[i];
      const unmetShare = p.R[i].size ? p.U[i].size / p.R[i].size : 0;
      const isCand = p.cands.includes(i);
      const excluded = state.exclude.has(i);
      const busyRank = busiest.indexOf(i) + 1;
      const [stLabel, stColor] = STATUS[s.status];

      // Plain-language reason for the rank
      let reason = "";
      if (pick) {
        const helpedOthers = pick.helped.filter((h) => h.i !== i).length;
        reason = `Ranked #${rank + 1} because ${fmtInt(p.u[i])} weekday entries here are on routes with no step-free platform, ` +
          `and the nearest step-free station on those routes is ${p.d0[i].toFixed(2)} km away. ` +
          (helpedOthers ? `Upgrading it also shortens the detour for ${helpedOthers} nearby complex${helpedOthers === 1 ? "" : "es"}. ` : "") +
          (busyRank > 20 ? `A busiest-first rule would rank it #${busyRank}.` : "");
      } else if (p.u[i] === 0) {
        reason = "Already step-free on every route it serves, so it is not a candidate. It may serve as the step-free alternative for nearby stations.";
      } else if (excluded) {
        reason = "Excluded from this scenario by the planner. It stays in the gap calculation but cannot be selected.";
      } else {
        reason = `Not in the top ${state.K}: its marginal benefit is lower than the selected sites, given what is already step-free or already in the plan.`;
      }

      const helped = pick ? pick.helped.slice().sort((a, b) => p.u[b.i] * (b.before - b.after) - p.u[a.i] * (a.before - a.after)).slice(0, 8) : [];
      const maxBefore = Math.max(0.01, ...helped.map((h) => h.before));
      const street = [["Sidewalk defects", "c311_sidewalk"], ["Broken curbs", "c311_curb"], ["Defective pedestrian ramps", "c311_ramp"], ["Street-light outages", "c311_street_light"]];

      mount(root, html`
        <div class="panel-head"><span class="label"><span class="tick${pick ? " amber" : ""}"></span>Station dossier</span><span class="meta">COMPLEX ${s.complex_id}</span></div>
        <div class="dossier">
          <button class="btn d-back" type="button" data-back>← Sequence</button>
          <div>
            <h3 class="d-title">${s.name}</h3>
            <div class="d-sub"><span class="status"><i style="background:${stColor}"></i>${stLabel}</span><span>${s.borough}</span><span>${s.structure}</span></div>
            <div style="margin-top:10px">${routeGlyphs(s, p.A[i])} <span class="ctl-help" style="margin-left:6px">filled = step-free route</span></div>
            ${s.ada_notes ? html`<p class="d-note">MTA note: ${s.ada_notes}</p>` : ""}
          </div>
          <div class="${pick ? "d-callout" : "panel"}" style="${pick ? "" : "padding:10px 12px"}">
            <span class="label">${pick ? `Recommended upgrade #${rank + 1}` : "Model assessment"}</span>
            <p>${reason}</p>
          </div>
          <div class="d-grid">
            <div class="d-cell"><span class="label">Weekday entries</span><span class="v">${fmtInt(s.w_weekday)}</span></div>
            <div class="d-cell"><span class="label">Weekend entries</span><span class="v">${fmtInt(s.w_weekend)}</span></div>
            <div class="d-cell"><span class="label">On unmet routes</span><span class="v">${fmtInt(p.u[i])} <small>${pct(unmetShare, 0)}</small></span></div>
            <div class="d-cell"><span class="label">Gap today</span><span class="v">${p.u[i] > 0 ? p.d0[i].toFixed(2) : "0.00"} <small>km</small></span></div>
            ${pick ? html`<div class="d-cell"><span class="label">Gap closed</span><span class="v" style="color:var(--amber)">${pct(pick.gapGain / kpi.B0, 2)}</span></div>
            <div class="d-cell"><span class="label">Bootstrap freq.</span><span class="v">${state.isDefault && rank < 20 ? pct(s.boot_top20_freq, 0) : "—"}</span></div>` : ""}
          </div>
          <div class="d-sec">
            <span class="label">Nearest step-free alternative today</span>
            <div class="d-list"><div>${p.u[i] === 0 ? raw("<span>This complex is step-free on all routes</span><span>—</span>")
              : alt >= 0 ? html`<a href="#" data-goto="${alt}" style="text-decoration:none">${shortName(stations[alt].name)} →</a><span>${p.d0[i].toFixed(2)} km</span>`
              : html`<span>None within ${p.opt.cap} km</span><span>capped</span>`}</div></div>
          </div>
          ${helped.length ? html`<div class="d-sec"><span class="label">Who this upgrade helps · gap before → after</span><div class="d-list">${helped.map((h) => html`
            <div><a href="#" data-goto="${h.i}" style="text-decoration:none;color:var(--text-1)">${shortName(stations[h.i].name)}</a><span>${h.before.toFixed(2)} → ${h.after.toFixed(2)} km</span>
              <div class="gapbar"><i class="before" style="width:${((100 * h.before) / maxBefore).toFixed(1)}%"></i><i class="after" style="width:${((100 * h.after) / maxBefore).toFixed(1)}%"></i></div></div>`)}</div></div>` : ""}
          <div class="d-sec">
            <span class="label">Street approach · DOT 311 within 400 m</span>
            <div class="d-list">${street.map(([lab, col]) => html`<div><span>${lab}</span><span>${s[col]} · ${ordinal(Math.round(100 * pctRank(col, s[col])))} pct<span class="pct-bar"><i style="width:${(100 * pctRank(col, s[col])).toFixed(0)}%"></i></span></span></div>`)}
              <div><span>Police-reported crashes / injured</span><span>${s.crashes} / ${s.crash_injured}</span></div></div>
            <p class="d-note">Requests are complaints, not verified defects, and scale with foot traffic. They flag where an elevator project should be paired with a DOT curb-ramp and sidewalk check. They are not part of the ranking.</p>
          </div>
          ${isCand ? html`<button class="btn amber" type="button" data-exclude="${i}">${excluded ? "Return to candidate pool" : "Exclude site · engineering constraint"}</button>` : ""}
        </div>`);
    },
  };
}
