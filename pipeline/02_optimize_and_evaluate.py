"""
Step 2 — optimise the upgrade sequence and evaluate it.

Evaluations
  1. Greedy vs. three heuristic baselines and a random baseline (K = 1..50)
  2. Greedy vs. exact MILP optimum (K = 5, 10, 20, 30)
  3. Out-of-sample: plan with August weights, score with September weights
  4. Bootstrap over weekdays: how often each station is selected in the top 20
  5. Sensitivity of the top-20 to modelling choices (route rule, partial rule, cap, dry-day weights)
  6. Borough equity of the current gap, with a Kruskal-Wallis test
  7. Stability of demand weights (Aug vs Sep Spearman correlation)

Outputs: outputs/metrics.json, outputs/plan_top50.csv, outputs/curves.csv, outputs/bootstrap_freq.csv
"""
from __future__ import annotations

import json
import time

import numpy as np
import pandas as pd
from scipy import stats

from stepfree import (DATA, LABOR_DAY, OUT, build_problem, covered, exact_milp, gap_index, gaps_after,
                      greedy, greedy_with_floor, haversine_matrix, standalone_gain)

rng = np.random.default_rng(42)
st = pd.read_csv(OUT / "stations.csv")
dist = haversine_matrix(st.lat.to_numpy(), st.lon.to_numpy())
M: dict = {}
KMAX, KH = 50, 20  # curve length, headline K

p = build_problem(st, dist=dist)
B0 = gap_index(p)
M["setup"] = {"n_complexes": len(st), "n_candidates": int(len(p.cands)),
              "candidate_status": st.iloc[p.cands].status.value_counts().to_dict(),
              "unmet_weekday_entries": float(p.u.sum()), "total_weekday_entries": float(st.w_weekday.sum()),
              "gap_index_now": B0, "cap_km": p.cap,
              "stations_at_cap": int(((p.d0 >= p.cap) & (p.u > 0)).sum())}
unmet = p.u > 0
M["current_gap"] = {
    "entry_weighted_mean_gap_km": float((p.u * p.d0).sum() / p.u.sum()),
    "median_gap_km_unmet_stations": float(np.median(p.d0[unmet])),
    "p90_gap_km_unmet_stations": float(np.percentile(p.d0[unmet], 90)),
    "share_unmet_demand_gap_over_1km": float(p.u[p.d0 > 1].sum() / p.u.sum()),
    "share_unmet_demand_gap_over_2km": float(p.u[p.d0 > 2].sum() / p.u.sum()),
}

# ------------------------------------------------------------------ 1. curves vs baselines
order_greedy = greedy(p, KMAX)
cands = p.cands
order_busiest = list(cands[np.argsort(-st.w_weekday.to_numpy()[cands])])
order_unmet = list(cands[np.argsort(-p.u[cands])])
sg = standalone_gain(p)
order_standalone = list(cands[np.argsort(-sg[cands])])

rows = []
rand_draws = 500
rand_curves = np.zeros((rand_draws, KMAX + 1))
for d in range(rand_draws):
    perm = rng.permutation(cands)
    cur = p.d0.copy(); rand_curves[d, 0] = B0
    for k in range(KMAX):
        cur = np.minimum(cur, p.D[:, perm[k]]); rand_curves[d, k + 1] = (p.u * cur).sum()
for k in range(KMAX + 1):
    rows.append({"K": k,
                 "greedy": gap_index(p, order_greedy[:k]),
                 "busiest_first": gap_index(p, order_busiest[:k]),
                 "most_unmet_entries": gap_index(p, order_unmet[:k]),
                 "standalone_score": gap_index(p, order_standalone[:k]),
                 "random_mean": float(rand_curves[:, k].mean()),
                 "random_p05": float(np.percentile(rand_curves[:, k], 5)),
                 "random_p95": float(np.percentile(rand_curves[:, k], 95))})
curves = pd.DataFrame(rows)
curves.to_csv(OUT / "curves.csv", index=False)


def red(col, k):
    return float(1 - curves.loc[k, col] / B0)


M["baselines"] = {}
for k in (5, 10, 20, 30, 50):
    M["baselines"][f"K{k}"] = {c: red(c, k) for c in
                              ["greedy", "busiest_first", "most_unmet_entries", "standalone_score", "random_mean"]}
    g, b = curves.loc[k, ["greedy", "busiest_first"]]
    M["baselines"][f"K{k}"]["greedy_vs_busiest_extra_reduction_rel"] = float((B0 - g) / (B0 - b) - 1)
    # how many busiest-first upgrades does it take to match greedy-K?
    match = curves.index[curves.busiest_first <= g]
    M["baselines"][f"K{k}"]["busiest_first_upgrades_to_match"] = int(match[0]) if len(match) else None

M["overlap_greedy_busiest_top20"] = len(set(order_greedy[:KH]) & set(order_busiest[:KH]))

# ------------------------------------------------------------------ coverage objective
M["coverage"] = {}
for T in (0.5, 1.0):
    og = greedy(p, KH, mode="coverage", T=T)
    M["coverage"][f"T{T}"] = {
        "share_unmet_covered_now": covered(p, (), T) / p.u.sum(),
        "share_after_greedy_coverage_K20": covered(p, og, T) / p.u.sum(),
        "share_after_busiest_K20": covered(p, order_busiest[:KH], T) / p.u.sum(),
        "share_after_gap_greedy_K20": covered(p, order_greedy[:KH], T) / p.u.sum(),
    }

# ------------------------------------------------------------------ 2. exact MILP check
M["milp"] = {}
for k in (5, 10, 20, 30):
    t = time.time()
    S, val, msg = exact_milp(p, k)
    g = gap_index(p, order_greedy[:k])
    M["milp"][f"K{k}"] = {"optimal_reduction": 1 - val / B0, "greedy_reduction": 1 - g / B0,
                          "greedy_share_of_optimal_gain": (B0 - g) / (B0 - val),
                          "same_set": set(S) == set(order_greedy[:k]),
                          "overlap": len(set(S) & set(order_greedy[:k])), "solver": msg,
                          "seconds": round(time.time() - t, 2)}
    print("MILP", k, M["milp"][f"K{k}"])

# ------------------------------------------------------------------ 3. out-of-sample Aug -> Sep
p_aug = build_problem(st, "w_weekday_aug", dist=dist)
p_sep = build_problem(st, "w_weekday_sep", dist=dist)
B0_sep = gap_index(p_sep)
plan_aug = greedy(p_aug, KH)
plan_sep_oracle = greedy(p_sep, KH)
busy_aug = list(p_aug.cands[np.argsort(-st.w_weekday_aug.to_numpy()[p_aug.cands])])[:KH]
M["out_of_sample"] = {
    "train": "Aug 2025 weekdays", "test": "Sep 2025 weekdays (excl. Labor Day)",
    "reduction_greedy_trained_on_aug": 1 - gap_index(p_sep, plan_aug) / B0_sep,
    "reduction_oracle_trained_on_sep": 1 - gap_index(p_sep, plan_sep_oracle) / B0_sep,
    "reduction_busiest_first_aug": 1 - gap_index(p_sep, busy_aug) / B0_sep,
    "overlap_aug_plan_vs_sep_oracle": len(set(plan_aug) & set(plan_sep_oracle)),
    "spearman_station_weights_aug_vs_sep": float(stats.spearmanr(st.w_weekday_aug, st.w_weekday_sep)[0]),
    "sep_over_aug_total_weekday_entries": float(st.w_weekday_sep.sum() / st.w_weekday_aug.sum()),
}

# ------------------------------------------------------------------ 4. bootstrap over weekdays
rid = pd.read_csv(DATA / "mta_station_daily_aug_sep_2025.csv", parse_dates=["service_date"])
rid = rid[(rid.service_date.dt.day_of_week < 5) & (rid.service_date != LABOR_DAY)]
piv = rid.pivot_table(index="service_date", columns="station_complex_id", values="entries")
piv = piv[st.complex_id]  # align column order with station table
days = piv.index.to_numpy()
B = 200
freq = np.zeros(len(st))
for b in range(B):
    samp = piv.loc[rng.choice(days, size=len(days), replace=True)]
    tmp = st.copy(); tmp["w_boot"] = samp.mean(axis=0, skipna=True).to_numpy()
    pb = build_problem(tmp, "w_boot", dist=dist)
    freq[greedy(pb, KH)] += 1
freq /= B
st["boot_top20_freq"] = freq
pd.DataFrame({"complex_id": st.complex_id, "boot_top20_freq": freq}).to_csv(OUT / "bootstrap_freq.csv", index=False)
M["bootstrap"] = {"replicates": B,
                  "greedy_top20_mean_selection_freq": float(freq[order_greedy[:KH]].mean()),
                  "greedy_top20_selected_in_ge_90pct": int((freq[order_greedy[:KH]] >= 0.9).sum()),
                  "stations_ever_selected": int((freq > 0).sum())}

# ------------------------------------------------------------------ 5. sensitivity
base20 = set(order_greedy[:KH])
configs = {
    "any_route_alternative": dict(same_route=False),
    "strict_partial (one-direction ADA = not step-free)": dict(strict_partial=True),
    "cap_3km": dict(cap=3.0), "cap_8km": dict(cap=8.0),
    "dry_weekday_weights": dict(weight_col="w_weekday_dry"),
    "weekend_weights": dict(weight_col="w_weekend"),
}
M["sensitivity_top20_overlap"] = {}
for name, kw in configs.items():
    pk = build_problem(st, dist=dist, **kw)
    s = set(greedy(pk, KH))
    M["sensitivity_top20_overlap"][name] = {"overlap_of_20": len(s & base20),
                                            "reduction_own_objective": 1 - gap_index(pk, s) / gap_index(pk)}

# ------------------------------------------------------------------ 6. borough equity
st["u"] = p.u; st["d0"] = p.d0
after = gaps_after(p, order_greedy[:KH])
st["d_after20"] = after
eq = []
for bor, g in st.groupby("borough"):
    um = g.u > 0
    eq.append({"borough": bor, "complexes": len(g), "weekday_entries": float(g.w_weekday.sum()),
               "share_entries_full_step_free": float(g.loc[g.status == "full", "w_weekday"].sum() / g.w_weekday.sum()),
               "share_complexes_no_step_free": float((g.status == "none").mean()),
               "entry_weighted_gap_km": float((g.u * g.d0).sum() / g.u.sum()),
               "entry_weighted_gap_km_after_top20": float((g.u * g.d_after20).sum() / g.u.sum()),
               "gap_index_share": float((g.u * g.d0).sum() / B0),
               "top20_upgrades": int(g.index.isin(order_greedy[:KH]).sum())})
M["borough_equity"] = eq
groups = [g.loc[g.u > 0, "d0"].to_numpy() for _, g in st.groupby("borough")]
kw = stats.kruskal(*groups)
M["borough_kruskal_wallis"] = {"H": float(kw.statistic), "p_value": float(kw.pvalue),
                               "note": "Station-level current gaps among complexes with unmet routes; stations are "
                                       "spatially correlated, so treat p as descriptive, not confirmatory."}

groups_arr = st.borough.to_numpy()
M["equity_floor"] = {}
for fl in (1, 2, 3):
    S = greedy_with_floor(p, KH, groups_arr, fl)
    M["equity_floor"][f"min_{fl}_per_borough"] = {
        "reduction": 1 - gap_index(p, S) / B0,
        "cost_vs_unconstrained_pct_points": (1 - gap_index(p, order_greedy[:KH]) / B0) - (1 - gap_index(p, S) / B0),
        "bronx_upgrades": int((groups_arr[S] == "Bronx").sum())}

# ------------------------------------------------------------------ plan table
plan = []
cur = p.d0.copy()
cum = 0.0
for rank, j in enumerate(order_greedy, 1):
    new = np.minimum(cur, p.D[:, j])
    gain = float((p.u * (cur - new)).sum())
    helped = np.flatnonzero((cur - new) > 1e-9)
    cum += gain
    plan.append({"rank": rank, "complex_id": int(st.complex_id[j]), "name": st.name[j], "borough": st.borough[j],
                 "status": st.status[j], "routes": st.routes[j], "w_weekday": float(st.w_weekday[j]),
                 "unmet_entries": float(p.u[j]), "current_gap_km": float(p.d0[j]),
                 "marginal_gain": gain, "standalone_gain": float(sg[j]),
                 "cum_reduction": cum / B0, "stations_helped": len(helped),
                 "busiest_rank_among_candidates": int(order_busiest.index(j)) + 1,
                 "boot_top20_freq": float(freq[j]),
                 "c311_sidewalk": int(st.c311_sidewalk[j]), "c311_curb": int(st.c311_curb[j]),
                 "c311_ramp": int(st.c311_ramp[j])})
    cur = new
pd.DataFrame(plan).to_csv(OUT / "plan_top50.csv", index=False)
st.to_csv(OUT / "stations_scored.csv", index=False)

(OUT / "metrics.json").write_text(json.dumps(M, indent=2, default=float))
print(json.dumps(M, indent=2, default=float))
print(pd.DataFrame(plan).head(20)[["rank", "name", "borough", "w_weekday", "current_gap_km", "marginal_gain",
                                   "cum_reduction", "busiest_rank_among_candidates", "boot_top20_freq"]].to_string())
