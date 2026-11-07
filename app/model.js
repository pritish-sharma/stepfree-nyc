/*
 * StepFree NYC — in-browser port of pipeline/stepfree.py.
 * Same definitions; parity with the Python reference is checked by tests/test_parity.js.
 */
(function (root) {
  "use strict";
  const R_KM = 6371.0088;

  function parse(s) { return s ? String(s).split(/\s+/).filter(Boolean) : []; }

  function buildDist(st) {
    const n = st.length, D = new Float64Array(n * n);
    const la = st.map(s => s.lat * Math.PI / 180), lo = st.map(s => s.lon * Math.PI / 180);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const h = Math.sin((la[i] - la[j]) / 2) ** 2 +
        Math.cos(la[i]) * Math.cos(la[j]) * Math.sin((lo[i] - lo[j]) / 2) ** 2;
      const d = 2 * R_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
      D[i * n + j] = d; D[j * n + i] = d;
    }
    return D;
  }

  function buildProblem(st, dist, opt) {
    opt = Object.assign({ weight: "w_weekday", sameRoute: true, strictPartial: false, cap: 5 }, opt || {});
    const n = st.length;
    const R = st.map(s => new Set(parse(s.routes)));
    const A = st.map(s => new Set(parse(opt.strictPartial ? s.acc_routes_strict : s.acc_routes)));
    const U = R.map((r, i) => new Set([...r].filter(x => !A[i].has(x))));
    const u = new Float64Array(n), d0 = new Float64Array(n), alt0 = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) u[i] = R[i].size ? st[i][opt.weight] * U[i].size / R[i].size : 0;
    const meets = (setA, setB) => { for (const x of setA) if (setB.has(x)) return true; return false; };
    const D = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      let best = Infinity, bj = -1;
      for (let j = 0; j < n; j++) {
        const d = dist[i * n + j];
        const existOk = opt.sameRoute ? meets(U[i], A[j]) : A[j].size > 0;
        if (existOk && d < best) { best = d; bj = j; }
        const candOk = opt.sameRoute ? meets(U[i], R[j]) : true;
        D[i * n + j] = i === j ? 0 : (candOk ? d : Infinity);
      }
      d0[i] = u[i] === 0 ? 0 : Math.min(best, opt.cap);
      alt0[i] = u[i] === 0 ? i : (best <= opt.cap ? bj : -1);
    }
    const cands = [];
    for (let i = 0; i < n; i++) if (U[i].size > 0) cands.push(i);
    return { n, u, d0, D, alt0, cands, R, A, U, opt };
  }

  function gapsAfter(p, S) {
    const g = Float64Array.from(p.d0), n = p.n;
    for (const j of S) for (let i = 0; i < n; i++) { const d = p.D[i * n + j]; if (d < g[i]) g[i] = d; }
    return g;
  }
  function gapIndex(p, S) { const g = gapsAfter(p, S || []); let t = 0; for (let i = 0; i < p.n; i++) t += p.u[i] * g[i]; return t; }
  function covered(p, S, T) { const g = gapsAfter(p, S || []); let t = 0; for (let i = 0; i < p.n; i++) if (g[i] <= T) t += p.u[i]; return t; }

  /* Greedy with optional borough floor and excluded stations. Returns ordered list of picks
     with marginal gain and the stations whose gap each pick reduces. */
  function greedy(p, K, opt) {
    opt = Object.assign({ mode: "gap", T: 0.8, floor: 0, groups: null, exclude: new Set() }, opt || {});
    const n = p.n, cur = Float64Array.from(p.d0), chosen = [], out = [];
    const pool0 = p.cands.filter(c => !opt.exclude.has(c));
    const need = {};
    if (opt.floor > 0 && opt.groups) for (const c of pool0) need[opt.groups[c]] = opt.floor;
    for (let step = 0; step < Math.min(K, pool0.length); step++) {
      const remaining = K - step;
      let owed = 0; for (const g in need) owed += Math.max(need[g], 0);
      let pool = pool0.filter(c => !chosen.includes(c));
      if (opt.floor > 0 && owed >= remaining) pool = pool.filter(c => need[opt.groups[c]] > 0);
      let best = -1, bj = -1;
      for (const j of pool) {
        let gain = 0;
        for (let i = 0; i < n; i++) {
          const d = p.D[i * n + j];
          if (opt.mode === "gap") { if (d < cur[i]) gain += p.u[i] * (cur[i] - d); }
          else if (cur[i] > opt.T && d <= opt.T) gain += p.u[i];
        }
        if (gain > best) { best = gain; bj = j; }
      }
      if (bj < 0) break;
      const helped = [];
      let gapGain = 0;
      for (let i = 0; i < n; i++) {
        const d = p.D[i * n + bj];
        if (d < cur[i] - 1e-9) { helped.push({ i, before: cur[i], after: d }); gapGain += p.u[i] * (cur[i] - d); cur[i] = d; }
      }
      chosen.push(bj);
      if (opt.groups && need[opt.groups[bj]] !== undefined) need[opt.groups[bj]] -= 1;
      out.push({ j: bj, gain: best, gapGain, helped });
    }
    return out;
  }

  function curve(p, order, kmax) {
    const n = p.n, cur = Float64Array.from(p.d0), res = [];
    let t = 0; for (let i = 0; i < n; i++) t += p.u[i] * cur[i]; res.push(t);
    for (let k = 0; k < kmax && k < order.length; k++) {
      const j = order[k];
      for (let i = 0; i < n; i++) { const d = p.D[i * n + j]; if (d < cur[i]) cur[i] = d; }
      t = 0; for (let i = 0; i < n; i++) t += p.u[i] * cur[i]; res.push(t);
    }
    return res;
  }

  const api = { parse, buildDist, buildProblem, gapsAfter, gapIndex, covered, greedy, curve };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StepFreeModel = api;
})(typeof window !== "undefined" ? window : globalThis);
