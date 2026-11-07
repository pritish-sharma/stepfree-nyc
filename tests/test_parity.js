// Checks that the browser model (app/model.js) reproduces the Python reference results.
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.resolve(__dirname, "..");
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "app/data.js"), "utf8"), ctx);
const data = ctx.window.STEPFREE;
const M = require(path.join(root, "app/model.js"));
const st = data.stations, dist = M.buildDist(st);
let fails = 0;
function check(name, ok, detail) { console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : "")); if (!ok) fails++; }

const p = M.buildProblem(st, dist);
const B0 = M.gapIndex(p);
const pyB0 = data.metrics.setup.gap_index_now;
check("baseline gap index", Math.abs(B0 - pyB0) / pyB0 < 1e-5, `${B0.toFixed(1)} vs ${pyB0.toFixed(1)}`);
check("candidate count", p.cands.length === data.metrics.setup.n_candidates);
const plan = M.greedy(p, 20).map(x => st[x.j].complex_id);
const ref = data.plan_reference.map(r => r.complex_id);
check("greedy top-20 order matches Python", JSON.stringify(plan) === JSON.stringify(ref));
const red = 1 - M.gapIndex(p, M.greedy(p, 20).map(x => x.j)) / B0;
check("K=20 reduction", Math.abs(red - data.metrics.baselines.K20.greedy) < 1e-5, red.toFixed(4));
const groups = st.map(s => s.borough);
const fl = M.greedy(p, 20, { floor: 1, groups }).map(x => x.j);
const flRed = 1 - M.gapIndex(p, fl) / B0;
check("borough floor=1 reduction", Math.abs(flRed - data.metrics.equity_floor.min_1_per_borough.reduction) < 1e-5, flRed.toFixed(4));
const cov = M.greedy(p, 20, { mode: "coverage", T: 1.0 }).map(x => x.j);
const covShare = M.covered(p, cov, 1.0) / p.u.reduce((a, b) => a + b, 0);
check("coverage T=1.0 share", Math.abs(covShare - data.metrics.coverage["T1.0"].share_after_greedy_coverage_K20) < 1e-5, covShare.toFixed(4));
const pa = M.buildProblem(st, dist, { sameRoute: false });
const oa = new Set(M.greedy(pa, 20).map(x => x.j)), base = new Set(M.greedy(p, 20).map(x => x.j));
check("any-route overlap", [...oa].filter(x => base.has(x)).length === data.metrics.sensitivity_top20_overlap.any_route_alternative.overlap_of_20);
process.exit(fails ? 1 : 0);
