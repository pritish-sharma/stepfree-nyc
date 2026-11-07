"""
StepFree NYC — core model.

Problem: choose K subway station complexes to make step-free (elevator / ADA upgrade)
so that the demand-weighted distance a rider would have to travel to reach a
step-free station serving the same route is as small as possible.

This is a facility-location problem. The objective is monotone submodular, so the
greedy algorithm has a (1 - 1/e) approximation guarantee; we also verify it against
an exact mixed-integer program (scipy.optimize.milp / HiGHS).

Notation (all arrays are indexed by station complex, n = 424):
    w[i]   average weekday entries at complex i
    R[i]   set of daytime routes serving complex i
    A[i]   subset of R[i] served by a step-free (ADA) platform today
    U[i]   = R[i] - A[i]   routes at i with no step-free platform ("unmet routes")
    u[i]   = w[i] * |U[i]| / |R[i]|   demand at i on unmet routes (equal-split assumption)
    dist   great-circle distance in km
    d0[i]  current gap: distance from i to the nearest complex j (j may equal i) whose
           step-free routes A[j] intersect U[i]; capped at `cap` km
    D[i,j] gap for i if j were upgraded: dist[i,j] if R[j] intersects U[i], else inf; D[i,i]=0

Gap objective      B(S) = sum_i u[i] * min(d0[i], min_{j in S} D[i,j])       (minimise)
Coverage objective C(S) = sum_i u[i] * 1[min(d0[i], min_{j in S} D[i,j]) <= T] (maximise)
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "public"
OUT = ROOT / "outputs"
FIG = OUT / "figures"

LABOR_DAY = pd.Timestamp("2025-09-01")
EARTH_R_KM = 6371.0088
DEFAULT_CAP_KM = 5.0
DEFAULT_RADIUS_KM = 0.4  # context radius for 311 / crash counts around a station


# --------------------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------------------
def haversine_matrix(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    la, lo = np.radians(lat), np.radians(lon)
    dla = la[:, None] - la[None, :]
    dlo = lo[:, None] - lo[None, :]
    h = np.sin(dla / 2) ** 2 + np.cos(la[:, None]) * np.cos(la[None, :]) * np.sin(dlo / 2) ** 2
    return 2 * EARTH_R_KM * np.arcsin(np.sqrt(np.clip(h, 0, 1)))


# --------------------------------------------------------------------------------------
# Problem construction
# --------------------------------------------------------------------------------------
@dataclass
class Problem:
    u: np.ndarray        # unmet demand weight per complex
    d0: np.ndarray       # current gap (km, capped)
    D: np.ndarray        # D[i, j] gap for i if j upgraded (km, inf if j cannot serve i)
    cands: np.ndarray    # indices of complexes that can be upgraded (U non-empty)
    cap: float
    same_route: bool


def parse_routes(s: str) -> set[str]:
    return set(str(s).split()) if isinstance(s, str) else set()


def build_problem(stations: pd.DataFrame, weight_col: str = "w_weekday", same_route: bool = True,
                  strict_partial: bool = False, cap: float = DEFAULT_CAP_KM,
                  dist: np.ndarray | None = None) -> Problem:
    """stations must contain lat, lon, routes, acc_routes, acc_routes_strict and the weight column."""
    n = len(stations)
    if dist is None:
        dist = haversine_matrix(stations.lat.to_numpy(), stations.lon.to_numpy())
    R = [parse_routes(s) for s in stations.routes]
    A = [parse_routes(s) for s in (stations.acc_routes_strict if strict_partial else stations.acc_routes)]
    U = [r - a for r, a in zip(R, A)]
    w = stations[weight_col].to_numpy(dtype=float)
    frac = np.array([len(u_) / len(r) if r else 0.0 for u_, r in zip(U, R)])
    u = w * frac

    # route incidence matrices for vectorised set-intersection tests
    routes = sorted(set().union(*R))
    idx = {r: k for k, r in enumerate(routes)}
    def inc(sets):
        M = np.zeros((n, len(routes)), dtype=bool)
        for i, s in enumerate(sets):
            for r in s:
                M[i, idx[r]] = True
        return M
    Rm, Am, Um = inc(R), inc(A), inc(U)

    if same_route:
        exist_ok = (Um.astype(int) @ Am.T.astype(int)) > 0     # A[j] ∩ U[i] ≠ ∅
        cand_ok = (Um.astype(int) @ Rm.T.astype(int)) > 0      # R[j] ∩ U[i] ≠ ∅
    else:
        exist_ok = np.repeat(Am.any(axis=1)[None, :], n, axis=0)  # any step-free station
        cand_ok = np.ones((n, n), dtype=bool)

    d_exist = np.where(exist_ok, dist, np.inf)
    d0 = np.minimum(d_exist.min(axis=1), cap)
    d0[u == 0] = 0.0

    D = np.where(cand_ok, dist, np.inf)
    np.fill_diagonal(D, 0.0)
    cands = np.flatnonzero(Um.any(axis=1))
    return Problem(u=u, d0=d0, D=D, cands=cands, cap=cap, same_route=same_route)


# --------------------------------------------------------------------------------------
# Objectives and solvers
# --------------------------------------------------------------------------------------
def gaps_after(p: Problem, S) -> np.ndarray:
    S = list(S)
    if not S:
        return p.d0.copy()
    return np.minimum(p.d0, p.D[:, S].min(axis=1))


def gap_index(p: Problem, S=(), u: np.ndarray | None = None) -> float:
    u = p.u if u is None else u
    return float((u * gaps_after(p, S)).sum())


def covered(p: Problem, S=(), T: float = 0.8, u: np.ndarray | None = None) -> float:
    u = p.u if u is None else u
    return float((u * (gaps_after(p, S) <= T)).sum())


def greedy(p: Problem, K: int, mode: str = "gap", T: float = 0.8, exclude=()) -> list[int]:
    cur = p.d0.copy()
    chosen: list[int] = []
    pool = np.array([c for c in p.cands if c not in set(exclude)])
    Dc = p.D[:, pool]
    for _ in range(min(K, len(pool))):
        if mode == "gap":
            gains = (p.u[:, None] * np.maximum(cur[:, None] - Dc, 0)).sum(axis=0)
        else:
            gains = (p.u[:, None] * ((cur[:, None] > T) & (Dc <= T))).sum(axis=0)
        if chosen:
            gains[np.isin(pool, chosen)] = -1
        k = int(np.argmax(gains))
        chosen.append(int(pool[k]))
        cur = np.minimum(cur, Dc[:, k])
    return chosen


def greedy_with_floor(p: Problem, K: int, groups: np.ndarray, floor: int) -> list[int]:
    """Greedy with an equity constraint: every group (borough) receives at least `floor` upgrades.
    At each step, if the remaining slots are only just enough to satisfy unmet quotas, the choice is
    restricted to candidates in groups that still need upgrades."""
    cur = p.d0.copy()
    chosen: list[int] = []
    labels = np.unique(groups[p.cands])
    need = {g: floor for g in labels}
    for step in range(K):
        remaining = K - step
        owed = sum(max(v, 0) for v in need.values())
        pool = [c for c in p.cands if c not in chosen]
        if owed >= remaining:
            pool = [c for c in pool if need[groups[c]] > 0]
        pool = np.array(pool)
        gains = (p.u[:, None] * np.maximum(cur[:, None] - p.D[:, pool], 0)).sum(axis=0)
        j = int(pool[int(np.argmax(gains))])
        chosen.append(j)
        need[groups[j]] -= 1
        cur = np.minimum(cur, p.D[:, j])
    return chosen


def standalone_gain(p: Problem) -> np.ndarray:
    """Gap reduction if each candidate were upgraded on its own (no interaction)."""
    g = (p.u[:, None] * np.maximum(p.d0[:, None] - p.D[:, p.cands], 0)).sum(axis=0)
    out = np.zeros(len(p.u))
    out[p.cands] = g
    return out


def exact_milp(p: Problem, K: int, time_limit: float = 120.0) -> tuple[list[int], float, str]:
    """Exact facility-location MILP (maximise gap reduction) with SciPy/HiGHS."""
    from scipy.optimize import Bounds, LinearConstraint, milp
    from scipy.sparse import coo_matrix

    cands = p.cands
    nc = len(cands)
    pairs_i, pairs_j, benefit = [], [], []
    for jj, j in enumerate(cands):
        imp = p.d0 - p.D[:, j]
        ii = np.flatnonzero((imp > 1e-12) & (p.u > 0))
        pairs_i.extend(ii.tolist()); pairs_j.extend([jj] * len(ii)); benefit.extend((p.u[ii] * imp[ii]).tolist())
    pairs_i, pairs_j, benefit = map(np.asarray, (pairs_i, pairs_j, benefit))
    m = len(benefit)
    nvar = nc + m
    c = np.concatenate([np.zeros(nc), -benefit])  # milp minimises

    rows, cols, vals, lb, ub = [], [], [], [], []
    r = 0
    # each demand point assigned to at most one new facility
    for i in np.unique(pairs_i):
        ks = np.flatnonzero(pairs_i == i)
        rows += [r] * len(ks); cols += (nc + ks).tolist(); vals += [1.0] * len(ks)
        lb.append(-np.inf); ub.append(1.0); r += 1
    # y_ij <= x_j
    for k in range(m):
        rows += [r, r]; cols += [nc + k, pairs_j[k]]; vals += [1.0, -1.0]
        lb.append(-np.inf); ub.append(0.0); r += 1
    # sum x = K
    rows += [r] * nc; cols += list(range(nc)); vals += [1.0] * nc
    lb.append(K); ub.append(K); r += 1

    A = coo_matrix((vals, (rows, cols)), shape=(r, nvar)).tocsr()
    integrality = np.concatenate([np.ones(nc), np.zeros(m)])
    res = milp(c, constraints=LinearConstraint(A, lb, ub), integrality=integrality,
               bounds=Bounds(0, 1), options={"time_limit": time_limit, "disp": False})
    x = res.x[:nc] if res.x is not None else np.zeros(nc)
    S = [int(cands[k]) for k in np.flatnonzero(x > 0.5)]
    return S, gap_index(p, S), str(res.message)
