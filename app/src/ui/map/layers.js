/**
 * Map layer definitions: each maps a station + scenario to a colour, a glow weight
 * and a legend. Colour is data; size always encodes weekday entries.
 */
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ramp = (stops) => (t) => {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[k], stops[k + 1], x - k);
};

export const C = {
  cyan: hex("#4fd1ff"), peri: hex("#8ea8ff"), slate: hex("#4b5b66"), dim: hex("#26333b"), amber: hex("#ffb547"),
};
const gapRamp = ramp([hex("#22303a"), hex("#1f6f93"), hex("#4fd1ff"), hex("#dff7ff")]);
const streetRamp = ramp([hex("#262c3c"), hex("#5a5a9e"), hex("#b3a6ff")]);
const GAP_MAX = 2.5;

export const LAYERS = {
  status: {
    label: "Status",
    note: "Current step-free status from the MTA accessibility snapshot. Amber rings mark the recommended upgrades for this scenario.",
    color: (i, ctx) => {
      const s = ctx.stations[i].status;
      return s === "full" ? C.cyan : s === "partial" ? C.peri : C.slate;
    },
    glow: (i, ctx) => (ctx.stations[i].status === "full" ? 0.32 : 0),
    legend: () => ({
      items: [["Step-free", "#4fd1ff"], ["Partly step-free", "#8ea8ff"], ["No step-free access", "#4b5b66"]],
    }),
  },
  gap: {
    label: "Gap now",
    note: "Distance from each station's riders to the nearest step-free station on a route they need, today. Brighter = longer detour.",
    color: (i, ctx) => (ctx.p.u[i] > 0 ? gapRamp(ctx.p.d0[i] / GAP_MAX) : C.dim),
    glow: (i, ctx) => (ctx.p.u[i] > 0 ? Math.max(0, (ctx.p.d0[i] - 1.2) / 2) : 0),
    legend: () => ({ ramp: gapRamp, domain: ["0 km", "1.25", "≥ 2.5 km"] }),
  },
  after: {
    label: "Gap after plan",
    note: "The same detour after this scenario's upgrades are built (model output). Compare with “Gap now” to see where the plan helps.",
    color: (i, ctx) => (ctx.p.u[i] > 0 ? gapRamp(ctx.after[i] / GAP_MAX) : C.dim),
    glow: (i, ctx) => (ctx.p.u[i] > 0 ? Math.max(0, (ctx.after[i] - 1.2) / 2) : 0),
    legend: () => ({ ramp: gapRamp, domain: ["0 km", "1.25", "≥ 2.5 km"] }),
  },
  street: {
    label: "Street",
    note: "DOT 311 sidewalk, curb and pedestrian-ramp requests within 400 m (Aug–Sep 2025). Complaints, not verified defects; context only.",
    color: (i, ctx) => streetRamp(ctx.streetPct[i]),
    glow: (i, ctx) => Math.max(0, ctx.streetPct[i] - 0.8) * 2,
    legend: () => ({ ramp: streetRamp, domain: ["fewest", "median", "most"] }),
  },
};

export const rampCss = (fn) => {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => { const c = fn(t); return `rgb(${c.map(Math.round).join(",")}) ${t * 100}%`; });
  return `linear-gradient(90deg, ${stops.join(",")})`;
};
