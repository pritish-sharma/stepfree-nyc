/**
 * Motion system. Durations and curves mirror the CSS tokens in styles/tokens.css
 * so JS-driven animation (counters, canvas, SVG paths) moves exactly like CSS-driven UI.
 * Everything collapses to an instant jump under prefers-reduced-motion.
 */
export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const DUR = { instant: 90, fast: 160, base: 280, slow: 520, xslow: 900 };

// cubic-bezier(0.16, 1, 0.3, 1) ≈ easeOutExpo-like; implemented as a fast approximation
export const ease = {
  out: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  std: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  linear: (t) => t,
};

/**
 * Tween a value; returns a cancel function. onUpdate(value, progress).
 * One rAF loop per tween; cancelled tweens stop immediately (no leaked frames).
 */
export function tween({ from, to, duration = DUR.slow, easing = ease.out, onUpdate, onDone }) {
  if (reducedMotion() || duration <= 0) { onUpdate(to, 1); onDone?.(); return () => {}; }
  let raf = 0;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const e = easing(p);
    onUpdate(typeof from === "number" ? from + (to - from) * e : interpolateArray(from, to, e), p);
    if (p < 1) raf = requestAnimationFrame(step); else onDone?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

function interpolateArray(a, b, e) {
  const out = new Array(b.length);
  for (let i = 0; i < b.length; i++) { const x = a[i] ?? b[i]; out[i] = x + (b[i] - x) * e; }
  return out;
}

/**
 * Animated readout: counts from the element's last value to the new one.
 * Used only when the underlying value changes (scenario edits) — never on a timer,
 * so static historical data is never presented as changing.
 */
const counters = new WeakMap();
export function countTo(el, value, format, duration = DUR.slow) {
  if (!el) return;
  const prev = counters.get(el);
  const from = prev ? prev.value : 0;
  prev?.cancel();
  const cancel = tween({
    from, to: value, duration, easing: ease.out,
    onUpdate: (v) => { el.textContent = format(v); },
  });
  counters.set(el, { value, cancel });
}

/** Run fn once the browser has painted the current frame (for CSS enter transitions). */
export const nextFrame = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
