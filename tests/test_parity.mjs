// Checks that the browser model (app/src/core/model.js) reproduces the Python reference results.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as M from "../app/src/core/model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "app/data.js"), "utf8"), ctx);
const data = ctx.window.STEPFREE;
const st = data.stations;
const dist = M.buildDist(st);
let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`); if (!ok) fails++; };
const close = (a, b, tol = 1e-5) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const p = M.buildProblem(st, dist);
const B0 = M.gapIndex(p);
check("baseline gap index", close(B0, data.metrics.setup.gap_index_now), `${B0.toFixed(1)} vs ${data.metrics.setup.gap_index_now.toFixed(1)}`);
check("candidate count", p.cands.length === data.metrics.setup.n_candidates);
const plan = M.greedy(p, 20);
check("greedy top-20 order matches Python",
  JSON.stringify(plan.map((x) => st[x.j].complex_id)) === JSON.stringify(data.plan_reference.map((r) => r.complex_id)));
check("K=20 reduction", close(1 - M.gapIndex(p, plan.map((x) => x.j)) / B0, data.metrics.baselines.K20.greedy));
const groups = st.map((s) => s.borough);
const fl = M.greedy(p, 20, { floor: 1, groups }).map((x) => x.j);
check("borough floor=1 reduction", close(1 - M.gapIndex(p, fl) / B0, data.metrics.equity_floor.min_1_per_borough.reduction));
const cov = M.greedy(p, 20, { mode: "coverage", T: 1.0 }).map((x) => x.j);
check("coverage T=1.0 share", close(M.covered(p, cov, 1.0) / M.totalUnmet(p), data.metrics.coverage["T1.0"].share_after_greedy_coverage_K20));
const pa = M.buildProblem(st, dist, { sameRoute: false });
const oa = new Set(M.greedy(pa, 20).map((x) => x.j));
const base = new Set(plan.map((x) => x.j));
check("any-route overlap", [...oa].filter((x) => base.has(x)).length === data.metrics.sensitivity_top20_overlap.any_route_alternative.overlap_of_20);
const sa = M.standaloneOrder(p, p.cands).slice(0, 20);
check("stand-alone K=20 reduction", close(1 - M.gapIndex(p, sa) / B0, data.metrics.baselines.K20.standalone_score));
process.exit(fails ? 1 : 0);
