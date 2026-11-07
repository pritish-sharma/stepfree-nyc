/** Shared SVG chart utilities: scales, nice ticks, element creation. */
export const NS = "http://www.w3.org/2000/svg";

export function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

export const linear = (d0, d1, r0, r1) => {
  const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.domain = [d0, d1];
  return f;
};

export function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return steps.find((s) => m <= s + 1e-9) * p;
}

export const ticks = (max, n = 5) => Array.from({ length: n + 1 }, (_, i) => (max * i) / n);

/** Observe an element's size and call fn(width, height) — debounced to one call per frame. */
export function observeSize(el, fn) {
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { const r = el.getBoundingClientRect(); if (r.width > 0) fn(r.width, r.height); });
  });
  ro.observe(el);
  return () => ro.disconnect();
}
