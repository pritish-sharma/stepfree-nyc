"""
Build the presentation: presentation/src/deck.html (template) -> presentation/index.html

Everything the slides show is computed here from the pipeline outputs (outputs/*.json|csv)
or recomputed with the pipeline's own model (pipeline/stepfree.py), then embedded as one
JSON blob. Fonts and the product screenshot are embedded too, so the deck runs offline
from a single file.

Run after ./run_all.sh:   python3 presentation/build.py
"""
from __future__ import annotations

import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from stepfree import build_problem, gap_index, greedy, haversine_matrix  # noqa: E402

SRC = ROOT / "presentation" / "src"
OUT = ROOT / "outputs"

M = json.loads((OUT / "metrics.json").read_text())
st = pd.read_csv(OUT / "stations_scored.csv")
curves = pd.read_csv(OUT / "curves.csv")
plan = pd.read_csv(OUT / "plan_top50.csv")
app_data = json.loads((ROOT / "app" / "data.js").read_text().split("=", 1)[1].rstrip().rstrip(";"))

dist = haversine_matrix(st.lat.to_numpy(), st.lon.to_numpy())
p = build_problem(st, dist=dist)
B0 = gap_index(p)
order = greedy(p, 20)
assert [int(st.complex_id[j]) for j in order] == plan.complex_id.head(20).tolist(), "plan mismatch with pipeline"

short = lambda s: s.rsplit(" (", 1)[0] if s.endswith(")") else s


def nearest_alt(i: int) -> int:
    """Index of today's nearest step-free alternative serving one of i's unmet routes."""
    R = set(str(st.routes[i]).split())
    A = [set(str(a).split()) if isinstance(a, str) else set() for a in st.acc_routes]
    U = R - A[i]
    best, bj = np.inf, -1
    for j in range(len(st)):
        if A[j] & U and dist[i, j] < best:
            best, bj = dist[i, j], j
    return bj


# --- stations (compact) ---------------------------------------------------------------
stations = [{
    "lat": round(r.lat, 5), "lon": round(r.lon, 5), "w": round(r.w_weekday), "s": r.status[0],
    "u": round(p.u[i]), "g": round(float(p.d0[i]), 3),
} for i, r in st.iterrows()]

# --- the obvious rule: 20 busiest candidates ---------------------------------------------
busiest = list(p.cands[np.argsort(-st.w_weekday.to_numpy()[p.cands])][:20])

# --- worst current gaps (for the problem slide): top by u * d0, with today's alternative --
burden = p.u * p.d0
worst = [int(i) for i in np.argsort(-burden)[:14]]
worst_links = [{"i": i, "alt": nearest_alt(i), "km": round(float(p.d0[i]), 2), "name": short(st.name[i])} for i in worst]

# --- Classon Av case study (pick #3) ----------------------------------------------------
k3 = 2
j3 = order[k3]
cur = np.minimum(p.d0, p.D[:, order[:k3]].min(axis=1))
after = np.minimum(cur, p.D[:, j3])
helped = [int(i) for i in np.flatnonzero(cur - after > 1e-9)]
case = {
    "i": int(j3), "name": short(st.name[j3]), "routes": st.routes[j3], "w": round(st.w_weekday[j3]),
    "gap": round(float(p.d0[j3]), 2), "alt": nearest_alt(j3), "alt_name": short(st.name[nearest_alt(j3)]),
    "rank": k3 + 1, "busiest_rank": int(plan.busiest_rank_among_candidates[k3]),
    "helped": [{"i": i, "name": short(st.name[i]), "before": round(float(cur[i]), 2), "after": round(float(after[i]), 2)} for i in helped],
    "share": round(float(plan.marginal_gain[k3] / B0), 4),
}

# --- plan --------------------------------------------------------------------------------
top = [{"i": int(j), "name": short(st.name[j]), "borough": st.borough[j], "w": round(st.w_weekday[j]),
        "gap": round(float(p.d0[j]), 2), "busiest_rank": int(plan.busiest_rank_among_candidates[k]),
        "share": round(float(plan.marginal_gain[k] / B0), 4), "boot": float(plan.boot_top20_freq[k])} for k, j in enumerate(order)]

# entry-weighted mean current gap of each strategy's 20 picks (own-station gap)
def wgap(idx):
    idx = list(idx)
    return round(float((p.u[idx] * p.d0[idx]).sum() / p.u[idx].sum()), 2)
rule = {"busiest_gap": wgap(busiest), "plan_gap": wgap(order),
        "busiest_entries": round(float(st.w_weekday.to_numpy()[busiest].sum())),
        "plan_entries": round(float(st.w_weekday.to_numpy()[order].sum())),
        "overlap": len(set(busiest) & set(order))}

# --- assets -------------------------------------------------------------------------------
def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


from PIL import Image  # noqa: E402

shot = Image.open(ROOT / "docs" / "img" / "app_station_detail.png").convert("RGB")
shot.thumbnail((1920, 1200))
buf = io.BytesIO()
shot.save(buf, "JPEG", quality=84, optimize=True)
shot_b64 = base64.b64encode(buf.getvalue()).decode()

fonts = {
    "Barlow": [(400, "barlow-latin-400-normal"), (500, "barlow-latin-500-normal"), (600, "barlow-latin-600-normal"), (700, "barlow-latin-700-normal")],
    "Barlow Semi Condensed": [(500, "barlow-semi-condensed-latin-500-normal"), (600, "barlow-semi-condensed-latin-600-normal"), (700, "barlow-semi-condensed-latin-700-normal")],
    "JetBrains Mono": [(400, "jetbrains-mono-latin-400-normal"), (500, "jetbrains-mono-latin-500-normal"), (600, "jetbrains-mono-latin-600-normal")],
}
font_css = "\n".join(
    f'@font-face{{font-family:"{fam}";font-weight:{w};font-style:normal;font-display:block;'
    f'src:url(data:font/woff2;base64,{b64(SRC / "fonts" / (f + ".woff2"))}) format("woff2")}}'
    for fam, faces in fonts.items() for w, f in faces)

deck = {
    "stations": stations,
    "segments": app_data["segments"],
    "metrics": {
        "setup": M["setup"], "current_gap": M["current_gap"], "baselines": M["baselines"],
        "milp": M["milp"], "out_of_sample": M["out_of_sample"], "bootstrap": M["bootstrap"],
        "sensitivity": M["sensitivity_top20_overlap"], "equity": M["borough_equity"], "equity_floor": M["equity_floor"],
        "kruskal": M["borough_kruskal_wallis"],
    },
    "curves": {c: (100 * (1 - curves[c] / B0)).round(2).tolist() for c in ["greedy", "busiest_first", "standalone_score", "random_p05", "random_p95"]},
    "rule": rule,
    "B0": B0,
    "busiest": [int(i) for i in busiest],
    "worst": worst_links,
    "case": case,
    "top": top,
    "profile": {"rows": int(json.loads((OUT / "data_profile.json").read_text())["ridership"]["rows"])},
}

html = (SRC / "deck.html").read_text()
html = html.replace("/*__FONTS__*/", font_css)
html = html.replace("__DECK_JSON__", json.dumps(deck, separators=(",", ":")))
html = html.replace("__SHOT_B64__", shot_b64)
out = ROOT / "presentation" / "index.html"
out.write_text(html)
print(f"wrote {out.relative_to(ROOT)}  {out.stat().st_size / 1024:.0f} KB")
print("case study:", case["name"], case["gap"], "km to", case["alt_name"], "| helps", [h["name"] for h in case["helped"]])
print("busiest top 5:", [short(st.name[i]) for i in busiest[:5]])
