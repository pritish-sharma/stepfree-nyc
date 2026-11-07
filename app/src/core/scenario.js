/**
 * Scenario engine: turns UI state into model outputs. All numbers shown in the
 * interface come from here (or straight from the pipeline's metrics.json).
 * Problems are memoised per (weight, route rule, partial rule) because building
 * one is the only O(n²) set-intersection step.
 */
import { buildDist, buildProblem, greedy, gapIndex, covered, totalUnmet, curve, gapsAfter } from "./model.js";

export const DEFAULTS = Object.freeze({
  K: 20, mode: "gap", T: 0.8, floor: 0, weight: "w_weekday", sameRoute: true, lenient: true,
});

export function createEngine(data) {
  const stations = data.stations;
  const dist = buildDist(stations);
  const groups = stations.map((s) => s.borough);
  const cache = new Map();

  function problem(state) {
    const key = `${state.weight}|${state.sameRoute}|${state.lenient}`;
    if (!cache.has(key)) {
      cache.set(key, buildProblem(stations, dist, {
        weight: state.weight, sameRoute: state.sameRoute, strictPartial: !state.lenient, cap: 5,
      }));
    }
    return cache.get(key);
  }

  /** Full scenario evaluation. */
  function run(state) {
    const p = problem(state);
    const exclude = state.exclude;
    const plan = greedy(p, state.K, { mode: state.mode, T: state.T, floor: state.floor, groups, exclude });
    const picks = plan.map((x) => x.j);
    const busiest = p.cands.filter((c) => !exclude.has(c))
      .sort((a, b) => stations[b][state.weight] - stations[a][state.weight]);

    const B0 = gapIndex(p, []);
    const B1 = gapIndex(p, picks);
    const Bb = gapIndex(p, busiest.slice(0, state.K));
    const uSum = totalUnmet(p);
    const T = state.mode === "coverage" ? state.T : 0.8;
    const busyCurve = curve(p, busiest, 150);
    const matchIdx = busyCurve.findIndex((v) => v <= B1 + 1e-9);
    const after = gapsAfter(p, picks);
    const rankOf = new Map(picks.map((j, k) => [j, k]));

    return {
      p, plan, picks, busiest, rankOf, after, groups,
      kpi: {
        B0, B1, Bb, uSum, T,
        reduction: 1 - B1 / B0,
        busiestReduction: 1 - Bb / B0,
        extraVsBusiest: (B0 - B1) / Math.max(B0 - Bb, 1e-9) - 1,
        busiestToMatch: matchIdx > 0 ? matchIdx : null,
        meanGap0: B0 / uSum,
        meanGap1: B1 / uSum,
        cov0: covered(p, [], T) / uSum,
        cov1: covered(p, picks, T) / uSum,
        covGainEntries: (covered(p, picks, T) - covered(p, [], T)),
      },
    };
  }

  return { stations, dist, groups, problem, run };
}

export const isDefaultScenario = (s) =>
  s.mode === DEFAULTS.mode && s.floor === DEFAULTS.floor && s.weight === DEFAULTS.weight &&
  s.sameRoute === DEFAULTS.sameRoute && s.lenient === DEFAULTS.lenient && s.exclude.size === 0;
