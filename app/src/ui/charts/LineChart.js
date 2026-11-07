/**
 * LineChart — SVG multi-series line chart with an optional uncertainty band and a
 * vertical marker. Lines draw progressively on first render, then morph between
 * scenarios. Hovering shows a crosshair with every series' value at that x.
 */
import { svgEl, linear, niceMax, ticks, observeSize } from "./svg.js";
import { tween, ease, DUR, reducedMotion } from "../motion.js";
import { showTooltip, hideTooltip } from "../tooltip.js";

export class LineChart {
  constructor(el, { xLabel = "", yLabel = "", yFormat = (v) => v, xFormat = (v) => v, margin } = {}) {
    this.el = el;
    this.opt = { xLabel, yLabel, yFormat, xFormat };
    this.m = margin || { t: 12, r: 18, b: 38, l: 46 };
    this.svg = svgEl("svg", { role: "img" }, el);
    this.gGrid = svgEl("g", { class: "axis" }, this.svg);
    this.gBand = svgEl("g", {}, this.svg);
    this.gLines = svgEl("g", {}, this.svg);
    this.gMarker = svgEl("g", {}, this.svg);
    this.gHover = svgEl("g", { opacity: 0 }, this.svg);
    this.hit = svgEl("rect", { fill: "transparent" }, this.svg);
    this.paths = new Map();
    this.shown = null;
    this.data = null;
    this.drawn = false;
    this.disconnect = observeSize(el, () => this.render(this.shown || this.data, false));
    this.bindHover();
  }

  update(data) {
    const prev = this.shown;
    this.data = data;
    this.svg.setAttribute("aria-label", data.ariaLabel || "");
    if (!prev || !this.drawn) { this.shown = data; this.render(data, true); return; }
    this.cancel?.();
    const from = prev.series.map((s) => s.values);
    const fromBand = prev.band;
    this.cancel = tween({
      from: 0, to: 1, duration: DUR.slow, easing: ease.std,
      onUpdate: (t) => {
        const mixed = {
          ...data,
          series: data.series.map((s, k) => ({ ...s, values: s.values.map((v, i) => lerp(from[k]?.[i] ?? v, v, t)) })),
          band: data.band && fromBand ? {
            lo: data.band.lo.map((v, i) => lerp(fromBand.lo[i] ?? v, v, t)),
            hi: data.band.hi.map((v, i) => lerp(fromBand.hi[i] ?? v, v, t)),
          } : data.band,
        };
        this.shown = mixed;
        this.render(mixed, false);
      },
    });
  }

  render(data, entering) {
    if (!data) return;
    const r = this.el.getBoundingClientRect();
    const W = Math.max(200, r.width), H = Math.max(140, r.height);
    const { m } = this;
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const xMax = data.x[data.x.length - 1];
    const yMax = data.yMax ?? niceMax(Math.max(...data.series.flatMap((s) => s.values), ...(data.band ? data.band.hi : [0])));
    const x = linear(0, xMax, m.l, W - m.r);
    const y = linear(0, yMax, H - m.b, m.t);
    this.scales = { x, y, W, H, yMax };

    // grid + axes (rebuilt; cheap)
    this.gGrid.replaceChildren();
    for (const v of ticks(yMax, 4)) {
      svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "gridline" }, this.gGrid);
      svgEl("text", { x: m.l - 8, y: y(v) + 3.5, "text-anchor": "end" }, this.gGrid).textContent = this.opt.yFormat(v);
    }
    for (const v of ticks(xMax, 5)) {
      svgEl("text", { x: x(v), y: H - m.b + 16, "text-anchor": "middle" }, this.gGrid).textContent = this.opt.xFormat(v);
    }
    svgEl("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "axisline" }, this.gGrid);
    if (this.opt.xLabel) svgEl("text", { x: (m.l + W - m.r) / 2, y: H - 4, "text-anchor": "middle", class: "lbl" }, this.gGrid).textContent = this.opt.xLabel;
    if (this.opt.yLabel) svgEl("text", { x: -(m.t + H - m.b) / 2, y: 11, transform: "rotate(-90)", "text-anchor": "middle", class: "lbl" }, this.gGrid).textContent = this.opt.yLabel;

    // band
    this.gBand.replaceChildren();
    if (data.band) {
      const top = data.band.hi.map((v, i) => `${x(data.x[i])},${y(v)}`);
      const bot = data.band.lo.map((v, i) => `${x(data.x[i])},${y(v)}`).reverse();
      svgEl("polygon", { points: [...top, ...bot].join(" "), fill: "rgba(130,200,230,0.09)" }, this.gBand);
    }

    // series
    for (const s of data.series) {
      let path = this.paths.get(s.key);
      if (!path) {
        path = svgEl("path", { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" }, this.gLines);
        this.paths.set(s.key, path);
      }
      path.setAttribute("stroke", s.color);
      path.setAttribute("stroke-width", s.width || 2);
      if (s.glow) path.setAttribute("filter", "drop-shadow(0 0 4px rgba(79,209,255,0.55))");
      path.setAttribute("d", s.values.map((v, i) => `${i ? "L" : "M"}${x(data.x[i]).toFixed(1)},${y(v).toFixed(1)}`).join(""));
      if (entering && !reducedMotion()) {
        const len = path.getTotalLength();
        path.style.transition = "none";
        path.style.strokeDasharray = `${len}`;
        path.style.strokeDashoffset = `${len}`;
        path.getBoundingClientRect();
        path.style.transition = `stroke-dashoffset 1100ms cubic-bezier(0.4,0,0.2,1) ${s.delay || 0}ms`;
        path.style.strokeDashoffset = "0";
        setTimeout(() => { path.style.strokeDasharray = ""; path.style.transition = ""; }, 1200 + (s.delay || 0));
      }
    }
    if (entering) this.drawn = true;

    // marker
    this.gMarker.replaceChildren();
    if (data.marker != null) {
      const mx = x(data.marker);
      svgEl("line", { x1: mx, x2: mx, y1: m.t, y2: H - m.b, stroke: "rgba(255,181,71,0.55)", "stroke-dasharray": "3 3" }, this.gMarker);
      svgEl("text", { x: mx + 6, y: m.t + 10, class: "lbl", fill: "#ffb547" }, this.gMarker).textContent = data.markerLabel || "";
    }
    this.hit.setAttribute("x", m.l); this.hit.setAttribute("y", m.t);
    this.hit.setAttribute("width", Math.max(0, W - m.l - m.r)); this.hit.setAttribute("height", Math.max(0, H - m.t - m.b));
  }

  bindHover() {
    const line = svgEl("line", { stroke: "rgba(231,241,245,0.35)" }, this.gHover);
    const dots = svgEl("g", {}, this.gHover);
    this.hit.addEventListener("pointermove", (e) => {
      const d = this.data;
      if (!d || !this.scales) return;
      const { x, y, H } = this.scales;
      const box = this.svg.getBoundingClientRect();
      const vb = this.svg.viewBox.baseVal;
      const px = ((e.clientX - box.left) / box.width) * vb.width;
      const xMax = d.x[d.x.length - 1];
      const xi = Math.max(0, Math.min(d.x.length - 1, Math.round(((px - this.m.l) / (x(xMax) - this.m.l)) * xMax)));
      const X = x(d.x[xi]);
      line.setAttribute("x1", X); line.setAttribute("x2", X); line.setAttribute("y1", this.m.t); line.setAttribute("y2", H - this.m.b);
      dots.replaceChildren();
      for (const s of d.series) svgEl("circle", { cx: X, cy: y(s.values[xi]), r: 3.5, fill: s.color, stroke: "#04070a", "stroke-width": 1.5 }, dots);
      this.gHover.setAttribute("opacity", 1);
      const rows = d.series.map((s) => `<div class="t-row"><span style="color:${s.color}">${s.label}</span><b>${this.opt.yFormat(s.values[xi], true)}</b></div>`).join("");
      showTooltip(`<div class="t-title">${d.hoverTitle ? d.hoverTitle(d.x[xi]) : d.x[xi]}</div>${rows}`, e.clientX, e.clientY);
    });
    this.hit.addEventListener("pointerleave", () => { this.gHover.setAttribute("opacity", 0); hideTooltip(); });
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
