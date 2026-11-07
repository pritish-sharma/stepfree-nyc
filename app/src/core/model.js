/**
 * StepFree NYC — optimisation model (browser port of pipeline/stepfree.py).
 *
 * Pure functions only: no DOM, no state. tests/test_parity.mjs checks that this file
 * reproduces the Python reference plan and metrics exactly (to floating-point rounding).
 *
 *   u(i)  entries on routes at i that lack a step-free platform
 *   d0(i) km to the nearest complex whose step-free routes include one of those routes (capped)
 *   D[i,j] gap for i if j were upgraded (Infinity if j does not serve a needed route)
 *   Access Gap Index G(S) = Σ u(i) · min(d0(i), min_{j∈S} D[i,j])
 */

const R_KM = 6371.0088;

export function parseRoutes(s) {
  return s ? String(s).split(/\s+/).filter(Boolean) : [];
}

/** Symmetric great-circle distance matrix (km) as a flat Float64Array, row-major. */
export function buildDist(stations) {
  const n = stations.length;
  const D = new Float64Array(n * n);
  const la = stations.map((s) => (s.lat * Math.PI) / 180);
  const lo = stations.map((s) => (s.lon * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const h = Math.sin((la[i] - la[j]) / 2) ** 2 +
        Math.cos(la[i]) * Math.cos(la[j]) * Math.sin((lo[i] - lo[j]) / 2) ** 2;
      const d = 2 * R_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
      D[i * n + j] = d;
      D[j * n + i] = d;
    }
  }
  return D;
}

const intersects = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };

/**
 * Build the optimisation instance for one scenario.
 * @param {object} opt weight column, sameRoute rule, strictPartial rule, cap (km)
 */
export function buildProblem(stations, dist, opt = {}) {
  const o = { weight: "w_weekday", sameRoute: true, strictPartial: false, cap: 5, ...opt };
  const n = stations.length;
  const R = stations.map((s) => new Set(parseRoutes(s.routes)));
  const A = stations.map((s) => new Set(parseRoutes(o.strictPartial ? s.acc_routes_strict : s.acc_routes)));
  const U = R.map((r, i) => new Set([...r].filter((x) => !A[i].has(x))));
  const u = new Float64Array(n);
  const d0 = new Float64Array(n);
  const alt0 = new Int32Array(n).fill(-1);
  const D = new Float64Array(n * n);

  for (let i = 0; i < n; i++) u[i] = R[i].size ? (stations[i][o.weight] * U[i].size) / R[i].size : 0;

  for (let i = 0; i < n; i++) {
    let best = Infinity;
    let bj = -1;
    for (let j = 0; j < n; j++) {
      const d = dist[i * n + j];
      const existOk = o.sameRoute ? intersects(U[i], A[j]) : A[j].size > 0;
      if (existOk && d < best) { best = d; bj = j; }
      const candOk = o.sameRoute ? intersects(U[i], R[j]) : true;
      D[i * n + j] = i === j ? 0 : candOk ? d : Infinity;
    }
    d0[i] = u[i] === 0 ? 0 : Math.min(best, o.cap);
    alt0[i] = u[i] === 0 ? i : best <= o.cap ? bj : -1;
  }
  const cands = [];
  for (let i = 0; i < n; i++) if (U[i].size > 0) cands.push(i);
  return { n, u, d0, D, alt0, cands, R, A, U, opt: o };
}

export function gapsAfter(p, S) {
  const g = Float64Array.from(p.d0);
  const n = p.n;
  for (const j of S) for (let i = 0; i < n; i++) { const d = p.D[i * n + j]; if (d < g[i]) g[i] = d; }
  return g;
}

export function gapIndex(p, S = []) {
  const g = gapsAfter(p, S);
  let t = 0;
  for (let i = 0; i < p.n; i++) t += p.u[i] * g[i];
  return t;
}

export function covered(p, S, T) {
  const g = gapsAfter(p, S || []);
  let t = 0;
  for (let i = 0; i < p.n; i++) if (g[i] <= T) t += p.u[i];
  return t;
}

export function totalUnmet(p) {
  let t = 0;
  for (let i = 0; i < p.n; i++) t += p.u[i];
  return t;
}

/**
 * Greedy selection with optional borough floor and exclusions.
 * Returns ordered picks: { j, gain (objective), gapGain (index reduction), helped: [{i, before, after}] }.
 */
export function greedy(p, K, opt = {}) {
  const o = { mode: "gap", T: 0.8, floor: 0, groups: null, exclude: new Set(), ...opt };
  const n = p.n;
  const cur = Float64Array.from(p.d0);
  const chosen = new Set();
  const out = [];
  const pool0 = p.cands.filter((c) => !o.exclude.has(c));
  const need = {};
  if (o.floor > 0 && o.groups) for (const c of pool0) need[o.groups[c]] = o.floor;

  for (let step = 0; step < Math.min(K, pool0.length); step++) {
    const remaining = K - step;
    let owed = 0;
    for (const g in need) owed += Math.max(need[g], 0);
    let pool = pool0.filter((c) => !chosen.has(c));
    if (o.floor > 0 && owed >= remaining) pool = pool.filter((c) => need[o.groups[c]] > 0);

    let best = -1;
    let bj = -1;
    for (const j of pool) {
      let gain = 0;
      for (let i = 0; i < n; i++) {
        const d = p.D[i * n + j];
        if (o.mode === "gap") { if (d < cur[i]) gain += p.u[i] * (cur[i] - d); }
        else if (cur[i] > o.T && d <= o.T) gain += p.u[i];
      }
      if (gain > best) { best = gain; bj = j; }
    }
    if (bj < 0) break;

    const helped = [];
    let gapGain = 0;
    for (let i = 0; i < n; i++) {
      const d = p.D[i * n + bj];
      if (d < cur[i] - 1e-9) {
        helped.push({ i, before: cur[i], after: d });
        gapGain += p.u[i] * (cur[i] - d);
        cur[i] = d;
      }
    }
    chosen.add(bj);
    if (o.groups && need[o.groups[bj]] !== undefined) need[o.groups[bj]] -= 1;
    out.push({ j: bj, gain: best, gapGain, helped });
  }
  return out;
}

/** Gap index after each prefix of `order` (length kmax + 1, starting at K = 0). */
export function curve(p, order, kmax) {
  const n = p.n;
  const cur = Float64Array.from(p.d0);
  const res = [];
  let t = 0;
  for (let i = 0; i < n; i++) t += p.u[i] * cur[i];
  res.push(t);
  for (let k = 0; k < kmax && k < order.length; k++) {
    const j = order[k];
    for (let i = 0; i < n; i++) { const d = p.D[i * n + j]; if (d < cur[i]) cur[i] = d; }
    t = 0;
    for (let i = 0; i < n; i++) t += p.u[i] * cur[i];
    res.push(t);
  }
  return res;
}

/** Benefit of each candidate if upgraded alone (ignores interaction between upgrades). */
export function standaloneOrder(p, pool) {
  const n = p.n;
  return pool
    .map((j) => {
      let g = 0;
      for (let i = 0; i < n; i++) { const d = p.D[i * n + j]; if (d < p.d0[i]) g += p.u[i] * (p.d0[i] - d); }
      return [j, g];
    })
    .sort((a, b) => b[1] - a[1])
    .map((x) => x[0]);
}
