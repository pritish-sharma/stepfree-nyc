"""
Step 3 — static figures for the README and the data bundle for the web app.

Outputs: outputs/figures/*.png, app/data.js
"""
from __future__ import annotations

import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from stepfree import FIG, OUT, ROOT

FIG.mkdir(parents=True, exist_ok=True)
BLUE, ORANGE, AQUA, GRAY, INK, INK2, GRID = "#2a78d6", "#eb6834", "#1baf7a", "#b9b8b2", "#0b0b0b", "#52514e", "#e6e5e0"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "figure.facecolor": "white"})

st = pd.read_csv(OUT / "stations_scored.csv")
plan = pd.read_csv(OUT / "plan_top50.csv")
curves = pd.read_csv(OUT / "curves.csv")
M = json.loads((OUT / "metrics.json").read_text())
B0 = M["setup"]["gap_index_now"]

# ---------------------------------------------------------------- 1. strategy curves
fig, ax = plt.subplots(figsize=(8, 4.6))
k = curves.K
pct = lambda c: 100 * (1 - curves[c] / B0)
ax.fill_between(k, 100 * (1 - curves.random_p95 / B0), 100 * (1 - curves.random_p05 / B0), color=GRAY, alpha=.35, lw=0,
                label="Random order (5–95%)")
ax.plot(k, pct("standalone_score"), color=AQUA, lw=2, label="Rank by stand-alone score")
ax.plot(k, pct("busiest_first"), color=ORANGE, lw=2, label="Busiest inaccessible station first")
ax.plot(k, pct("greedy"), color=BLUE, lw=2.4, label="StepFree optimizer (= exact MILP optimum)")
for kk in (20,):
    g, b = pct("greedy")[kk], pct("busiest_first")[kk]
    ax.scatter([kk, kk], [g, b], color=[BLUE, ORANGE], s=36, zorder=5, edgecolor="white", linewidth=1.5)
    ax.annotate(f"{g:.1f}%", (kk, g), xytext=(6, 4), textcoords="offset points", color=INK, fontsize=10, weight="bold")
    ax.annotate(f"{b:.1f}%", (kk, b), xytext=(6, -12), textcoords="offset points", color=INK, fontsize=10)
ax.set_xlabel("Number of station complexes upgraded (K)")
ax.set_ylabel("Access Gap Index reduction (%)")
ax.set_title("Optimized sequencing closes the gap far faster than 'busiest first'", loc="left", color=INK, fontsize=12)
ax.legend(frameon=False, loc="upper left", fontsize=9)
ax.set_xlim(0, 50); ax.set_ylim(0, 60)
fig.tight_layout(); fig.savefig(FIG / "strategy_curves.png", dpi=200); plt.close(fig)

# ---------------------------------------------------------------- 2. map
fig, ax = plt.subplots(figsize=(6.4, 7.2))
ax.grid(False); ax.set_xticks([]); ax.set_yticks([])
for s in ax.spines.values(): s.set_visible(False)
top = set(plan.complex_id.head(20))
m_none = st.status == "none"
size = 6 + 60 * np.sqrt(st.w_weekday / st.w_weekday.max())
ax.scatter(st.lon[m_none], st.lat[m_none], s=size[m_none], color=GRAY, alpha=.8, lw=0, label="No step-free access")
ax.scatter(st.lon[st.status == "partial"], st.lat[st.status == "partial"], s=size[st.status == "partial"], color=AQUA, lw=0,
           label="Partially step-free")
ax.scatter(st.lon[st.status == "full"], st.lat[st.status == "full"], s=size[st.status == "full"], color=BLUE, lw=0,
           label="Step-free")
mt = st.complex_id.isin(top)
ax.scatter(st.lon[mt], st.lat[mt], s=size[mt] + 40, facecolor="none", edgecolor=ORANGE, lw=2, label="Top-20 recommended upgrade")
for _, r in plan.head(8).iterrows():
    row = st[st.complex_id == r.complex_id].iloc[0]
    ax.annotate(f"{int(r['rank'])}", (row.lon, row.lat), xytext=(5, 3), textcoords="offset points", fontsize=8, color=INK,
                weight="bold")
ax.set_aspect(1 / np.cos(np.radians(40.7)))
ax.set_xlim(st.lon.min() - 0.12, st.lon.max() + 0.01)
ax.legend(frameon=False, loc="upper left", fontsize=8.5, markerscale=.8)
ax.set_title("Subway complexes by step-free status (dot size = weekday entries)", loc="left", fontsize=11, color=INK)
fig.tight_layout(); fig.savefig(FIG / "map_top20.png", dpi=200); plt.close(fig)

# ---------------------------------------------------------------- 3. borough equity
eq = pd.DataFrame(M["borough_equity"]).sort_values("entry_weighted_gap_km")
fig, ax = plt.subplots(figsize=(7.5, 3.6))
y = np.arange(len(eq))
ax.barh(y + .2, eq.entry_weighted_gap_km, height=.36, color=GRAY, label="Today")
ax.barh(y - .2, eq.entry_weighted_gap_km_after_top20, height=.36, color=BLUE, label="After top-20 plan")
for yy, a, b, n in zip(y, eq.entry_weighted_gap_km, eq.entry_weighted_gap_km_after_top20, eq.top20_upgrades):
    ax.text(a + .02, yy + .2, f"{a:.2f} km", va="center", fontsize=9, color=INK2)
    ax.text(b + .02, yy - .2, f"{b:.2f} km  ({n} upgrades)", va="center", fontsize=9, color=INK)
ax.set_yticks(y, eq.borough); ax.grid(axis="y", visible=False)
ax.set_xlabel("Ridership-weighted distance to nearest same-route step-free station (km)")
ax.set_title("The efficiency-optimal plan gives the Bronx zero upgrades", loc="left", fontsize=12, color=INK)
ax.legend(frameon=False, loc="lower right", fontsize=9); ax.set_xlim(0, 1.6)
fig.tight_layout(); fig.savefig(FIG / "borough_equity.png", dpi=200); plt.close(fig)

# ---------------------------------------------------------------- 4. out-of-sample
oos = M["out_of_sample"]
labels = ["Busiest-first\n(planned on Aug)", "StepFree\n(planned on Aug)", "Oracle\n(planned on Sep)"]
vals = [100 * oos["reduction_busiest_first_aug"], 100 * oos["reduction_greedy_trained_on_aug"],
        100 * oos["reduction_oracle_trained_on_sep"]]
fig, ax = plt.subplots(figsize=(6.2, 3.6))
bars = ax.bar(labels, vals, color=[ORANGE, BLUE, GRAY], width=.55)
for b_, v in zip(bars, vals):
    ax.text(b_.get_x() + b_.get_width() / 2, v + .8, f"{v:.1f}%", ha="center", fontsize=10, color=INK)
ax.set_ylabel("Gap reduction on September data (%)"); ax.grid(axis="x", visible=False); ax.set_ylim(0, 40)
ax.set_title("Out-of-sample: a plan made on August holds up in September (K = 20)", loc="left", fontsize=11, color=INK)
fig.tight_layout(); fig.savefig(FIG / "out_of_sample.png", dpi=200); plt.close(fig)

# ---------------------------------------------------------------- app bundle
cols = ["complex_id", "name", "borough", "lat", "lon", "routes", "acc_routes", "acc_routes_strict", "status",
        "w_weekday", "w_weekday_aug", "w_weekday_sep", "w_weekday_dry", "w_weekend", "structure", "ada_notes",
        "c311_sidewalk", "c311_curb", "c311_ramp", "c311_street_light", "c311_all", "crashes", "crash_injured",
        "boot_top20_freq"]
s = st[cols].copy()
for c in ["routes", "acc_routes", "acc_routes_strict", "ada_notes", "structure"]:
    s[c] = s[c].fillna("")
for c in ["w_weekday", "w_weekday_aug", "w_weekday_sep", "w_weekday_dry", "w_weekend"]:
    s[c] = s[c].round(1)
s["lat"] = s.lat.round(6); s["lon"] = s.lon.round(6)
profile = json.loads((OUT / "data_profile.json").read_text())
bundle = {"stations": s.to_dict(orient="records"), "metrics": M, "curves": curves.round(2).to_dict(orient="list"),
          "profile": profile, "plan_reference": plan.head(20)[["rank", "complex_id"]].to_dict(orient="records")}
(ROOT / "app").mkdir(exist_ok=True)
(ROOT / "app" / "data.js").write_text("window.STEPFREE = " + json.dumps(bundle, separators=(",", ":")) + ";\n")
print("wrote figures and app/data.js", (ROOT / "app" / "data.js").stat().st_size // 1024, "KB")
