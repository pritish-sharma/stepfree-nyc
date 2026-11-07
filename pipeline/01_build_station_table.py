"""
Step 1 — build one row per subway station complex.

Joins (all at the station-complex level, so no many-to-many row multiplication):
  * MTA daily ridership (complex x day)  -> aggregated to per-complex demand weights
  * MTA accessibility (stop level)       -> aggregated to per-complex location, routes, ADA status
  * NOAA weather (station x day)         -> used only to flag wet days for a robustness check
  * NYC 311 DOT requests (point)         -> counts within 400 m of each complex (context only)
  * NYPD collisions (point)              -> counts within 400 m of each complex (context only)

Outputs: outputs/stations.csv, outputs/data_profile.json
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

from stepfree import DATA, DEFAULT_RADIUS_KM, EARTH_R_KM, LABOR_DAY, OUT

OUT.mkdir(parents=True, exist_ok=True)
profile: dict = {}

# ---------------------------------------------------------------- ridership
rid = pd.read_csv(DATA / "mta_station_daily_aug_sep_2025.csv", parse_dates=["service_date"])
profile["ridership"] = {
    "rows": len(rid), "complexes": int(rid.station_complex_id.nunique()),
    "days": int(rid.service_date.nunique()),
    "date_min": str(rid.service_date.min().date()), "date_max": str(rid.service_date.max().date()),
    "missing_values": int(rid.isna().sum().sum()),
    "duplicate_complex_days": int(rid.duplicated(["service_date", "station_complex_id"]).sum()),
    "complexes_per_day_min": int(rid.groupby("service_date").size().min()),
    "complex_days_missing": int(rid.station_complex_id.nunique() * rid.service_date.nunique() - len(rid)),
    "zero_entry_rows": int((rid.entries == 0).sum()),
    "boroughs": rid.borough.value_counts().to_dict(),
}

# ---------------------------------------------------------------- weather (wet-day flag)
wx = pd.read_csv(DATA / "noaa_daily_weather_aug_sep_2025.csv", parse_dates=["DATE"])
wx_city = wx.groupby("DATE").agg(prcp_mm=("PRCP", "mean"), tmax_c=("TMAX", "mean")).reset_index()
wet_days = set(wx_city.loc[wx_city.prcp_mm >= 2.5, "DATE"])   # >= 2.5 mm city mean = "wet"
profile["weather"] = {"rows": len(wx), "stations": wx.NAME.unique().tolist(),
                      "missing_values": int(wx.isna().sum().sum()), "wet_days_ge_2_5mm": len(wet_days)}

rid["dow"] = rid.service_date.dt.day_of_week
rid["weekday"] = (rid.dow < 5) & (rid.service_date != LABOR_DAY)
rid["month"] = rid.service_date.dt.month
rid["wet"] = rid.service_date.isin(wet_days)

wk = rid[rid.weekday]
demand = pd.DataFrame({
    "w_weekday": wk.groupby("station_complex_id").entries.mean(),
    "w_weekday_aug": wk[wk.month == 8].groupby("station_complex_id").entries.mean(),
    "w_weekday_sep": wk[wk.month == 9].groupby("station_complex_id").entries.mean(),
    "w_weekday_dry": wk[~wk.wet].groupby("station_complex_id").entries.mean(),
    "w_weekend": rid[rid.dow >= 5].groupby("station_complex_id").entries.mean(),
    "n_weekdays": wk.groupby("station_complex_id").size(),
})
names = rid.groupby("station_complex_id").agg(name=("station_complex", "first"), borough=("borough", "first"))
demand = names.join(demand)
profile["ridership"]["weekdays_used"] = int(wk.service_date.nunique())
profile["ridership"]["wet_weekdays"] = int(wk.loc[wk.wet, "service_date"].nunique())

# ---------------------------------------------------------------- accessibility (stop level -> complex)
acc = pd.read_csv(DATA / "mta_station_accessibility_current.csv")
profile["accessibility"] = {"rows": len(acc), "complexes": int(acc.complex_id.nunique()),
                            "ada_value_counts": {str(k): int(v) for k, v in acc.ada.value_counts().items()}}


def agg_complex(g: pd.DataFrame) -> pd.Series:
    routes = sorted({r for s in g.daytime_routes for r in str(s).split()})
    acc_r = sorted({r for s, a in zip(g.daytime_routes, g.ada) if a in (1, 2) for r in str(s).split()})
    acc_r_strict = sorted({r for s, a in zip(g.daytime_routes, g.ada) if a == 1 for r in str(s).split()})
    if (g.ada == 1).all():
        status = "full"
    elif (g.ada > 0).any():
        status = "partial"
    else:
        status = "none"
    return pd.Series({
        "lat": g.gtfs_latitude.mean(), "lon": g.gtfs_longitude.mean(),
        "routes": " ".join(routes), "acc_routes": " ".join(acc_r), "acc_routes_strict": " ".join(acc_r_strict),
        "status": status, "n_stops": len(g), "structure": "/".join(sorted(g.structure.unique())),
        "ada_notes": "; ".join(g.ada_notes.dropna().astype(str).unique()),
        "stop_names": " / ".join(sorted(g.stop_name.unique())),
    })


cx = acc.groupby("complex_id").apply(agg_complex, include_groups=False)
st = demand.join(cx, how="left")
profile["join"] = {"ridership_complexes": len(demand), "matched_to_accessibility": int(st.lat.notna().sum()),
                   "accessibility_complexes_without_ridership": int((~cx.index.isin(demand.index)).sum()),
                   "note": "Unmatched accessibility complexes are the 21 Staten Island Railway stations, "
                           "which are not in the subway ridership file."}
assert st.lat.notna().all(), "every ridership complex must match an accessibility complex"

# ---------------------------------------------------------------- 311 + crashes within radius (context)
tree = BallTree(np.radians(st[["lat", "lon"]].to_numpy()), metric="haversine")
r = DEFAULT_RADIUS_KM / EARTH_R_KM


def count_near(df: pd.DataFrame, lat="latitude", lon="longitude", weights=None) -> np.ndarray:
    """For every station, count (or weight-sum) points within the radius. Each point may count
    toward several nearby stations: these are per-station context values and are never summed."""
    pts = df[[lat, lon]].to_numpy()
    st_tree_counts = np.zeros(len(st))
    pt_tree = BallTree(np.radians(pts), metric="haversine")
    ind = pt_tree.query_radius(np.radians(st[["lat", "lon"]].to_numpy()), r)
    for k, ii in enumerate(ind):
        st_tree_counts[k] = len(ii) if weights is None else weights[ii].sum()
    return st_tree_counts


sr = pd.read_csv(DATA / "nyc311_dot_aug_sep_2025.csv", parse_dates=["created_date"])
profile["311"] = {"rows": len(sr), "missing_coords": int(sr.latitude.isna().sum()),
                  "duplicate_keys": int(sr.unique_key.duplicated().sum()),
                  "top_types": sr.complaint_type.value_counts().head(8).to_dict()}
sr = sr.dropna(subset=["latitude", "longitude"])
sidewalk = sr[(sr.complaint_type == "Sidewalk Condition") & (sr.descriptor != "Dumpster - Construction Waste")]
curb = sr[(sr.complaint_type == "Curb Condition") & (sr.descriptor != "Defacement")]
ramp = sr[sr.descriptor == "Pedestrian Ramp Defective"]
st["c311_sidewalk"] = count_near(sidewalk)
st["c311_curb"] = count_near(curb)
st["c311_ramp"] = count_near(ramp)
st["c311_street_light"] = count_near(sr[sr.complaint_type == "Street Light Condition"])
st["c311_all"] = count_near(sr)

cr = pd.read_csv(DATA / "nyc_crashes_aug_sep_2025.csv")
bad = cr.latitude.isna() | (cr.latitude.abs() < 1) | ~cr.latitude.between(40.4, 41.0) | ~cr.longitude.between(-74.3, -73.6)
profile["crashes"] = {"rows": len(cr), "missing_or_invalid_coords": int(bad.sum()),
                      "missing_borough": int(cr.borough.isna().sum()),
                      "duplicate_ids": int(cr.collision_id.duplicated().sum()),
                      "persons_injured": int(cr.number_of_persons_injured.sum()),
                      "persons_killed": int(cr.number_of_persons_killed.sum())}
cr = cr[~bad]
st["crashes"] = count_near(cr)
st["crash_injured"] = count_near(cr, weights=cr.number_of_persons_injured.to_numpy())

st.index.name = "complex_id"
st = st.reset_index()
st.to_csv(OUT / "stations.csv", index=False)

profile["stations"] = {
    "status_counts": st.status.value_counts().to_dict(),
    "weekday_entries_total": float(st.w_weekday.sum()),
    "weekday_entries_by_status": st.groupby("status").w_weekday.sum().round(0).to_dict(),
}
(OUT / "data_profile.json").write_text(json.dumps(profile, indent=2, default=str))
print(json.dumps(profile, indent=2, default=str))
