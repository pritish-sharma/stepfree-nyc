/**
 * BarChart — grouped bars, horizontal or vertical. Bars grow from the baseline on
 * first render and tween to new values on update. Values label each bar directly.
 */
import { svgEl, linear, niceMax, observeSize } from "./svg.js";
import { tween, ease, DUR } from "../motion.js";
import { showTooltip, hideTooltip } from "../tooltip.js";

export class BarChart {
  constructor(el, { orientation = "h", format = (v) => v, axisLabel = "", margin, max } = {}) {
    this.el = el;
    this.o = { orientation, format, axisLabel, max };
    this.m = margin || (orientation === "h" ? { t: 6, r: 96, b: 30, l: 84 } : { t: 22, r: 10, b: 40, l: 40 });
    this.svg = svgEl("svg", { role: "img" }, el);
    this.shownVals = null;
    this.data = null;
    this.disconnect = observeSize(el, () => this.render(this.shownVals));
  }

  update(data) {
    this.data = data;
    this.svg.setAttribute("aria-label", data.ariaLabel || "");
    const target = data.series.map((s) => s.values.slice());
    const from = this.shownVals || target.map((v) => v.map(() => 0));
    this.cancel?.();
    this.cancel = tween({
      from: 0, to: 1, duration: this.shownVals ? DUR.slow : DUR.xslow, easing: ease.out,
      onUpdate: (t) => { this.render(target.map((vals, k) => vals.map((v, i) => from[k][i] + (v - from[k][i]) * t))); },
    });
    this.shownVals = target;
  }

  render(vals) {
    const d = this.data;
    if (!d || !vals) return;
    const r = this.el.getBoundingClientRect();
    const W = Math.max(220, r.width), H = Math.max(140, r.height);
    const { m } = this;
    const horiz = this.o.orientation === "h";
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.replaceChildren();
    const max = this.o.max ?? niceMax(Math.max(...d.series.flatMap((s) => s.values)) * 1.05);
    const nCat = d.categories.length, nSer = d.series.length;
    const band = ((horiz ? H - m.t - m.b : W - m.l - m.r) / nCat);
    const barT = Math.min(18, (band * 0.7) / nSer);
    const val = horiz ? linear(0, max, m.l, W - m.r) : linear(0, max, H - m.b, m.t);

    // baseline + gridlines
    const nT = [3, 5, 6].find((t) => Math.abs(Math.round((max / t) * 10) - (max / t) * 10) < 1e-6) || 4;
    for (let k = 0; k <= nT; k++) {
      const v = (max * k) / nT;
      if (horiz) {
        svgEl("line", { x1: val(v), x2: val(v), y1: m.t, y2: H - m.b, class: "gridline" }, this.svg);
        svgEl("text", { x: val(v), y: H - m.b + 15, "text-anchor": "middle", class: "lbl" }, this.svg).textContent = this.o.format(v);
      } else {
        svgEl("line", { x1: m.l, x2: W - m.r, y1: val(v), y2: val(v), class: "gridline" }, this.svg);
        svgEl("text", { x: m.l - 6, y: val(v) + 3.5, "text-anchor": "end", class: "lbl" }, this.svg).textContent = this.o.format(v);
      }
    }
    d.categories.forEach((cat, c) => {
      const c0 = (horiz ? m.t : m.l) + band * c + (band - barT * nSer - 3 * (nSer - 1)) / 2;
      const catLabel = svgEl("text", horiz
        ? { x: m.l - 10, y: m.t + band * c + band / 2 + 4, "text-anchor": "end" }
        : { x: m.l + band * c + band / 2, y: H - m.b + 16, "text-anchor": "middle" }, this.svg);
      catLabel.setAttribute("class", "lbl");
      catLabel.style.fill = "#a3b4bd";
      catLabel.textContent = cat;
      d.series.forEach((s, k) => {
        const v = vals[k][c];
        const p0 = c0 + k * (barT + 3);
        const rect = horiz
          ? svgEl("rect", { x: m.l, y: p0, width: Math.max(0, val(v) - m.l), height: barT, fill: s.colors?.[c] || s.color, rx: 1 }, this.svg)
          : svgEl("rect", { x: p0, y: val(v), width: barT, height: Math.max(0, H - m.b - val(v)), fill: s.colors?.[c] || s.color, rx: 1 }, this.svg);
        const label = s.labels ? s.labels[c] : this.o.format(v, true);
        if (label) {
          svgEl("text", horiz
            ? { x: val(v) + 6, y: p0 + barT / 2 + 3.5, class: "lbl" }
            : { x: p0 + barT / 2, y: val(v) - 6, "text-anchor": "middle", class: "lbl" }, this.svg).textContent = label;
        }
        rect.addEventListener("pointermove", (e) => showTooltip(`<div class="t-title">${cat}</div><div class="t-row"><span>${s.label}</span><b>${this.o.format(d.series[k].values[c], true)}</b></div>`, e.clientX, e.clientY));
        rect.addEventListener("pointerleave", hideTooltip);
      });
    });
    if (this.o.axisLabel && horiz) svgEl("text", { x: (m.l + W - m.r) / 2, y: H - 2, "text-anchor": "middle", class: "lbl" }, this.svg).textContent = this.o.axisLabel;
  }
}
