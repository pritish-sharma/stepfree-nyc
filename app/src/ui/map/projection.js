/**
 * Local equirectangular projection centred on NYC. At city scale this is
 * visually indistinguishable from Web Mercator and keeps distances honest:
 * one world unit = one degree of latitude (≈ 111.2 km) in both axes.
 */
const PHI0 = (40.73 * Math.PI) / 180;
export const KX = Math.cos(PHI0);

export const project = (lat, lon) => [lon * KX, -lat];
export const unproject = (x, y) => [-y, x / KX];

/** Camera: world point at screen centre + pixels per world unit. */
export class Camera {
  constructor() { this.cx = 0; this.cy = 0; this.s = 1; this.w = 1; this.h = 1; }
  resize(w, h) { this.w = w; this.h = h; }
  toScreen(x, y) { return [(x - this.cx) * this.s + this.w / 2, (y - this.cy) * this.s + this.h / 2]; }
  toWorld(px, py) { return [(px - this.w / 2) / this.s + this.cx, (py - this.h / 2) / this.s + this.cy]; }
  /** Fit bounds inside the viewport minus padding {l, r, t, b} (overlay-aware). */
  fit(bounds, pad = { l: 40, r: 40, t: 40, b: 40 }) {
    const [x0, y0, x1, y1] = bounds;
    const aw = Math.max(80, this.w - pad.l - pad.r), ah = Math.max(80, this.h - pad.t - pad.b);
    this.s = Math.min(aw / (x1 - x0), ah / (y1 - y0));
    // centre of the free area, expressed as a world point at screen centre
    const offX = (pad.l - pad.r) / 2, offY = (pad.t - pad.b) / 2;
    this.cx = (x0 + x1) / 2 - offX / this.s;
    this.cy = (y0 + y1) / 2 - offY / this.s;
  }
  /** Zoom by factor around a screen point (keeps that point fixed). */
  zoomAt(f, px, py, sMin, sMax) {
    const [wx, wy] = this.toWorld(px, py);
    this.s = Math.max(sMin, Math.min(sMax, this.s * f));
    this.cx = wx - (px - this.w / 2) / this.s;
    this.cy = wy - (py - this.h / 2) / this.s;
  }
  pan(dx, dy) { this.cx -= dx / this.s; this.cy -= dy / this.s; }
  state() { return { cx: this.cx, cy: this.cy, s: this.s }; }
}
