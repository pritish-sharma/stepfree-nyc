/**
 * MapView — canvas renderer for the geospatial core.
 *
 * Draws only data: a lat/lon graticule, the schematic line network (consecutive stops in
 * MTA station order), the 424 station complexes (size = weekday entries, colour = active layer),
 * recommended upgrades (amber rings + rank), and, for a selected station, its link to today's
 * nearest step-free alternative and to every station the upgrade would help.
 *
 * Rendering is on demand: a frame is drawn only when something changed or an animation is
 * running, so an idle map costs nothing.
 */
import { Camera, project, unproject } from "./projection.js";
import { LAYERS, C } from "./layers.js";
import { tween, ease, DUR, reducedMotion } from "../motion.js";

const MIN_S = 140, MAX_S = 9000; // px per degree-of-latitude

export class MapView {
  constructor(container, { stations, segments, onSelect, onHover, onCursor }) {
    this.el = container;
    this.stations = stations;
    this.onSelect = onSelect; this.onHover = onHover; this.onCursor = onCursor;
    this.cam = new Camera();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas = document.createElement("canvas");
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "application");
    this.canvas.setAttribute("aria-label", "Map of NYC subway station complexes. Arrow keys pan, plus and minus zoom, Escape clears the selection.");
    container.prepend(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    const n = stations.length;
    this.n = n;
    this.world = stations.map((s) => project(s.lat, s.lon));
    this.segs = segments.map(([a, b, c, d]) => [...project(a, b), ...project(c, d)]);
    const wmax = Math.max(...stations.map((s) => s.w_weekday));
    this.baseR = stations.map((s) => 1.4 + 7.2 * Math.sqrt(s.w_weekday / wmax));
    const xs = this.world.map((p) => p[0]), ys = this.world.map((p) => p[1]);
    this.bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const cx = (this.bounds[0] + this.bounds[2]) / 2, cy = (this.bounds[1] + this.bounds[3]) / 2;
    const dmax = Math.max(...this.world.map(([x, y]) => Math.hypot(x - cx, y - cy)));
    this.introOrder = this.world.map(([x, y]) => Math.hypot(x - cx, y - cy) / dmax);

    // animated per-station visual state: r, g, b, glow
    this.cur = new Float32Array(n * 4);
    this.from = new Float32Array(n * 4);
    this.to = new Float32Array(n * 4);
    this.mixT = 1;
    this.layer = "status";
    this.ctxData = null;
    this.rankOf = new Map();
    this.selected = null; this.hover = null;
    this.linkT = 1; this.pulseT = 1; this.introT = 1;
    this.cancelers = {};
    this._raf = 0;

    this.bind();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize(true);
  }

  // ------------------------------------------------------------------ public API
  setScenario(ctxData) {
    this.ctxData = ctxData;
    this.rankOf = ctxData.rankOf;
    this.retarget();
  }

  setLayer(name) {
    if (!LAYERS[name] || name === this.layer) return;
    this.layer = name;
    this.retarget();
  }

  setSelected(i, { fly = false } = {}) {
    if (i === this.selected && !fly) return;
    this.selected = i;
    if (i != null) {
      this.animate("link", (t) => { this.linkT = t; }, DUR.xslow);
      this.animate("pulse", (t) => { this.pulseT = t; }, 1100);
      if (fly) this.flyTo(this.world[i], Math.min(4200, Math.max(this.cam.s * 1.35, 2600)));
    }
    this.invalidate();
  }

  intro() {
    if (reducedMotion()) { this.introT = 1; this.invalidate(); return; }
    this.introT = 0;
    this.animate("intro", (t) => { this.introT = t; }, 1300, ease.std);
  }

  zoomBy(f) {
    const from = this.cam.s, to = Math.max(MIN_S, Math.min(MAX_S, from * f));
    this.animate("zoom", (t) => { this.cam.s = from + (to - from) * t; }, DUR.base, ease.out);
  }

  resetView() {
    const c = new Camera(); c.resize(this.cam.w, this.cam.h); c.fit(this.bounds, this.fitPad());
    this.flyTo([c.cx, c.cy], c.s);
  }

  flyTo([x, y], s) {
    const a = this.cam.state();
    this.animate("fly", (t) => {
      this.cam.cx = a.cx + (x - a.cx) * t;
      this.cam.cy = a.cy + (y - a.cy) * t;
      this.cam.s = a.s + (s - a.s) * t;
    }, 760, ease.std);
  }

  // ------------------------------------------------------------------ internals
  retarget() {
    if (!this.ctxData) return;
    const L = LAYERS[this.layer];
    this.from.set(this.cur);
    for (let i = 0; i < this.n; i++) {
      const c = L.color(i, this.ctxData);
      this.to[i * 4] = c[0]; this.to[i * 4 + 1] = c[1]; this.to[i * 4 + 2] = c[2];
      this.to[i * 4 + 3] = L.glow(i, this.ctxData);
    }
    if (!this._initialised) { this.cur.set(this.to); this.from.set(this.to); this._initialised = true; this.invalidate(); return; }
    this.animate("mix", (t) => {
      this.mixT = t;
      for (let k = 0; k < this.cur.length; k++) this.cur[k] = this.from[k] + (this.to[k] - this.from[k]) * t;
    }, DUR.slow, ease.std);
  }

  animate(key, fn, duration, easing = ease.out) {
    this.cancelers[key]?.();
    this.cancelers[key] = tween({ from: 0, to: 1, duration, easing, onUpdate: (v) => { fn(v); this.invalidate(); } });
  }

  invalidate() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
  }

  resize(first = false) {
    const r = this.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    const had = this.cam.w > 1;
    this.cam.resize(r.width, r.height);
    if (first || !had) this.cam.fit(this.bounds, this.fitPad());
    this.invalidate();
  }

  /** Keep the city clear of the overlay controls on wide stages. */
  fitPad() {
    return this.cam.w > 720 ? { l: 250, r: 80, t: 24, b: 24 } : { l: 16, r: 16, t: 60, b: 16 };
  }

  radius(i) {
    const z = Math.sqrt(this.cam.s / 800);
    return this.baseR[i] * Math.max(0.75, Math.min(2.6, z));
  }

  pick(px, py) {
    let best = null, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const [sx, sy] = this.cam.toScreen(...this.world[i]);
      const d = Math.hypot(sx - px, sy - py);
      if (d < this.radius(i) + 7 && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  bind() {
    const cv = this.canvas;
    const pointers = new Map();
    let downAt = null, moved = false, pinchD = 0;

    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      downAt = [e.offsetX, e.offsetY]; moved = false;
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]); }
      this.cancelers.fly?.();
    });
    cv.addEventListener("pointermove", (e) => {
      const p = [e.offsetX, e.offsetY];
      const [lat, lon] = unproject(...this.cam.toWorld(...p));
      this.onCursor?.(lat, lon);
      if (pointers.has(e.pointerId)) {
        const prev = pointers.get(e.pointerId);
        pointers.set(e.pointerId, p);
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinchD) this.cam.zoomAt(d / pinchD, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, MIN_S, MAX_S);
          pinchD = d; moved = true; this.invalidate(); return;
        }
        if (Math.hypot(p[0] - downAt[0], p[1] - downAt[1]) > 4) moved = true;
        if (moved) { cv.classList.add("dragging"); this.cam.pan(p[0] - prev[0], p[1] - prev[1]); this.invalidate(); }
        return;
      }
      const h = this.pick(...p);
      if (h !== this.hover) { this.hover = h; cv.classList.toggle("hovering", h != null); this.invalidate(); }
      this.onHover?.(h, e.clientX, e.clientY);
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchD = 0;
      cv.classList.remove("dragging");
      if (!moved && downAt && pointers.size === 0) {
        const h = this.pick(e.offsetX, e.offsetY);
        this.onSelect?.(h);
      }
      if (pointers.size === 0) downAt = null;
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", () => { if (this.hover != null) { this.hover = null; this.invalidate(); } this.onHover?.(null); });
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.cancelers.fly?.();
      this.cam.zoomAt(Math.exp(-e.deltaY * 0.0016), e.offsetX, e.offsetY, MIN_S, MAX_S);
      this.invalidate();
    }, { passive: false });
    cv.addEventListener("dblclick", (e) => {
      const a = this.cam.state();
      const [wx, wy] = this.cam.toWorld(e.offsetX, e.offsetY);
      const s = Math.min(MAX_S, a.s * 2);
      this.flyTo([wx, wy], s);
    });
    cv.addEventListener("keydown", (e) => {
      const step = 60;
      const k = e.key;
      if (k === "ArrowLeft") this.cam.pan(step, 0);
      else if (k === "ArrowRight") this.cam.pan(-step, 0);
      else if (k === "ArrowUp") this.cam.pan(0, step);
      else if (k === "ArrowDown") this.cam.pan(0, -step);
      else if (k === "+" || k === "=") return this.zoomBy(1.4);
      else if (k === "-" || k === "_") return this.zoomBy(1 / 1.4);
      else if (k === "Escape") return this.onSelect?.(null);
      else return;
      e.preventDefault(); this.invalidate();
    });
  }

  // ------------------------------------------------------------------ drawing
  draw() {
    const { ctx, cam, dpr } = this;
    const W = cam.w, H = cam.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.ctxData) return;

    this.drawGraticule(W, H);
    this.drawNetwork();
    this.drawLinks();
    this.drawStations();
    this.drawPicks();
    this.drawSelection();
  }

  drawGraticule(W, H) {
    const { ctx, cam } = this;
    // smallest round step that keeps grid lines ≥ 90 px apart
    const step = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2].find((d) => d * cam.s * 0.757 >= 90) || 0.2;
    const [lat0, lon0] = unproject(...cam.toWorld(0, H));
    const [lat1, lon1] = unproject(...cam.toWorld(W, 0));
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(110,185,225,0.06)";
    ctx.fillStyle = "rgba(140,170,185,0.45)";
    ctx.font = "500 9.5px 'JetBrains Mono', ui-monospace, monospace";
    ctx.beginPath();
    for (let la = Math.ceil(lat0 / step) * step; la <= lat1; la += step) {
      const y = Math.round(cam.toScreen(0, -la)[1]) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    for (let lo = Math.ceil(lon0 / step) * step; lo <= lon1; lo += step) {
      const x = Math.round(cam.toScreen(project(0, lo)[0], 0)[0]) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    ctx.stroke();
    // edge labels
    const dp = step < 0.01 ? 3 : 2;
    ctx.textBaseline = "middle";
    for (let la = Math.ceil(lat0 / step) * step; la <= lat1; la += step) {
      const y = cam.toScreen(0, -la)[1];
      if (y > 40 && y < H - 60) ctx.fillText(`${la.toFixed(dp)}°N`, W - 62, y - 7);
    }
    ctx.textBaseline = "top";
    for (let lo = Math.ceil(lon0 / step) * step; lo <= lon1; lo += step) {
      const x = cam.toScreen(project(0, lo)[0], 0)[0];
      if (x > 230 && x < W - 300) ctx.fillText(`${Math.abs(lo).toFixed(dp)}°W`, x + 4, H - 16);
    }
  }

  drawNetwork() {
    const { ctx, cam } = this;
    const a = 0.16 * this.introT;
    ctx.strokeStyle = `rgba(79,209,255,${a})`;
    ctx.lineWidth = Math.max(0.8, Math.min(2, cam.s / 1400));
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of this.segs) {
      const [ax, ay] = cam.toScreen(x1, y1), [bx, by] = cam.toScreen(x2, y2);
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }

  drawLinks() {
    const i = this.selected;
    if (i == null || !this.ctxData) return;
    const { ctx, cam } = this;
    const { p, plan } = this.ctxData;
    const [sx, sy] = cam.toScreen(...this.world[i]);
    const t = this.linkT;

    // today's nearest step-free alternative (dashed cyan)
    const alt = p.alt0[i];
    if (p.u[i] > 0 && alt >= 0 && alt !== i) {
      const [ax, ay] = cam.toScreen(...this.world[alt]);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(79,209,255,0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (ax - sx) * t, sy + (ay - sy) * t); ctx.stroke();
      ctx.restore();
    }
    // stations this upgrade helps (amber, drawn outward)
    const pk = plan.find((x) => x.j === i);
    if (pk) {
      ctx.strokeStyle = "rgba(255,181,71,0.75)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const h of pk.helped) {
        if (h.i === i) continue;
        const [hx, hy] = cam.toScreen(...this.world[h.i]);
        ctx.moveTo(sx, sy); ctx.lineTo(sx + (hx - sx) * t, sy + (hy - sy) * t);
      }
      ctx.stroke();
    }
  }

  drawStations() {
    const { ctx, cam, cur } = this;
    const W = cam.w, H = cam.h;
    const intro = this.introT;
    const pts = new Array(this.n);
    // glow pass (additive)
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.n; i++) {
      const [x, y] = cam.toScreen(...this.world[i]);
      pts[i] = [x, y];
      if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
      const a = appear(intro, this.introOrder[i]);
      const g = cur[i * 4 + 3] * a;
      if (g <= 0.01) continue;
      const r = Math.min(26, this.radius(i) * 3.4);
      const rgb = `${cur[i * 4] | 0},${cur[i * 4 + 1] | 0},${cur[i * 4 + 2] | 0}`;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${rgb},${0.5 * Math.min(1, g)})`);
      grd.addColorStop(0.35, `rgba(${rgb},${0.14 * Math.min(1, g)})`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    // core pass
    for (let i = 0; i < this.n; i++) {
      const [x, y] = pts[i];
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const a = appear(intro, this.introOrder[i]);
      if (a <= 0) continue;
      const r = this.radius(i) * (0.6 + 0.4 * a);
      const excluded = this.ctxData.exclude?.has(i);
      ctx.fillStyle = `rgba(${cur[i * 4] | 0},${cur[i * 4 + 1] | 0},${cur[i * 4 + 2] | 0},${(excluded ? 0.3 : 0.95) * a})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (i === this.hover) {
        ctx.strokeStyle = "rgba(231,241,245,0.9)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    this._pts = pts;
  }

  drawPicks() {
    const { ctx, cam } = this;
    const pts = this._pts;
    if (!pts) return;
    const showAllLabels = cam.s > 2200;
    ctx.font = "600 10.5px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    for (const [j, k] of this.rankOf) {
      const a = appear(this.introT, this.introOrder[j]);
      if (a <= 0) continue;
      const [x, y] = pts[j];
      const r = this.radius(j) + 3.2;
      ctx.strokeStyle = `rgba(${C.amber.join(",")},${0.95 * a})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      if (k < 10 || showAllLabels) {
        const label = String(k + 1);
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(4,7,10,0.9)";
        ctx.strokeText(label, x + r + 3, y - r * 0.6);
        ctx.fillStyle = `rgba(${C.amber.join(",")},${a})`;
        ctx.fillText(label, x + r + 3, y - r * 0.6);
      }
    }
  }

  drawSelection() {
    const i = this.selected;
    if (i == null || !this._pts) return;
    const { ctx } = this;
    const [x, y] = this._pts[i];
    const r = this.radius(i) + 8;
    // reticle
    ctx.strokeStyle = "rgba(231,241,245,0.95)";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(x + dx * (r + 3), y + dy * (r + 3)); ctx.lineTo(x + dx * (r + 9), y + dy * (r + 9));
    }
    ctx.stroke();
    // one-shot acquisition pulse
    if (this.pulseT < 1) {
      const pr = r + 34 * this.pulseT;
      ctx.strokeStyle = `rgba(79,209,255,${0.7 * (1 - this.pulseT)})`;
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.stroke();
    }
  }

  destroy() { this.ro.disconnect(); Object.values(this.cancelers).forEach((c) => c?.()); cancelAnimationFrame(this._raf); }
}

/** Staggered radial reveal used during boot. */
function appear(t, order) {
  if (t >= 1) return 1;
  return Math.max(0, Math.min(1, (t * 1.5 - order) / 0.5));
}
