# Judge Q&A prep

Short, accurate answers. Every number traces to `outputs/metrics.json`.

### Problem and data

**1. Why this problem?**
The MTA committed in 2022 to make 95% of stations accessible by 2055, so station sequencing is a live, recurring capital decision. It is also a question the provided data can answer well: ridership gives demand and the station file gives supply. Prediction projects often stop at "here is a forecast". This one ends in a decision.

**2. Why are these datasets appropriate?**
Ridership is the best available measure of how many people a station serves. The accessibility file gives the location, routes and ADA status of each platform. They share `complex_id`, and all 424 ridership complexes matched. NOAA, 311 and collisions play supporting roles: robustness and street-approach context.

**3. The accessibility file is a recent snapshot, not 2025. Isn't that a mismatch?**
For a forward-looking plan, "what is step-free today" is exactly what you want. We never use it to explain 2025 ridership. The caveat: if a station was upgraded after the snapshot, the planner would still recommend it, so a planner should refresh the status file before use.

**4. How did you avoid many-to-many joins?**
Everything is aggregated to one row per station complex before joining. Ridership is averaged over weekdays per complex. Accessibility stops are rolled up per complex. 311 and crash counts are computed per station with a radius query and never summed across stations, so overlapping buffers can't double-count.

**5. What data-quality issues did you find?**
- Ridership: no duplicates or missing values; 44 missing complex-days, all on weekends, so every complex has all 42 weekdays.
- 21 accessibility complexes (all Staten Island Railway) have no ridership, so they are excluded.
- 4,252 311 requests lack coordinates; 460 crashes have missing or out-of-NYC coordinates. Both were dropped for spatial counts.
- The accessibility file uses ADA = 2 for one-direction access, which is why we offer both a strict and a lenient rule.

### Method

**6. Explain the Access Gap Index in one sentence.**
For every station, take the weekday entries on routes that lack step-free access and multiply by the distance to the nearest step-free station serving one of those routes. Sum over stations. Units are entry-km per weekday.

**7. Why same-route distance and not just the nearest accessible station?**
A wheelchair user starting on the G train needs a step-free G station to reach G destinations. A step-free 7 station nearby doesn't help them. The app lets you switch to "any route". The top 20 then changes (6/20 overlap), and we show that openly because it is a policy choice.

**8. Why greedy? Isn't it just a heuristic?**
The objective is a facility-location function, which is monotone submodular, so greedy is guaranteed at least 63% of the optimum. We also solved the exact mixed-integer program with SciPy's HiGHS solver. Greedy found the proven optimum at K = 5, 10, 20 and 30.

**9. Why no machine learning model?**
This is an allocation problem, not a prediction problem. There is no label for "correct upgrade", and the data has no before/after upgrade periods to learn a ridership effect from. A transparent optimizer, validated against baselines, the exact optimum, a time hold-out and a bootstrap, is more defensible than a model that predicts something we can't observe. The datathon slides say judging is on the quality of the analysis, not how sophisticated the model looks.

**10. How does the equal-split assumption at partial complexes affect results?**
Route-level ridership isn't in the data, so a complex with 2 of 4 routes step-free counts half its entries as affected. Only 6 candidate complexes are partial. The strict-partial sensitivity run keeps 19 of 20 picks.

### Evaluation and validity

**11. What's your baseline, and how much better are you?**
The main baseline is "busiest inaccessible station first", the rule a planner would use without a model. At K = 20: 33.8% vs 18.9% of the gap closed, and busiest-first needs 39 upgrades to match. We also beat a stand-alone-score ranking (22.1%) and random orders (12.5% mean).

**12. Is there data leakage?**
There is no supervised model, so there is no train/test leakage in the usual sense. The hold-out is honest: the plan is built from August weekday entries only and evaluated with September entries it never saw. The August plan closes 33.3% of the September gap vs 33.6% for an oracle plan.

**13. How stable is the recommendation?**
- Bootstrap over 200 weekday resamples: 18 of 20 picks appear in at least 90% of resamples (mean 98%).
- Dry-day weights (NOAA), distance caps of 3 or 8 km, and the strict partial rule leave the top 20 nearly or exactly unchanged.
- Weekend weights keep 16/20.

**14. Is the borough difference statistically significant?**
Kruskal–Wallis on station-level gaps: H = 18.1, p = 0.0004. Stations are spatially correlated, so they aren't independent observations; we present it as descriptive, not confirmatory. The practical finding doesn't depend on the p-value: the efficiency plan allocates 0 of 20 upgrades to the Bronx.

**15. Do your findings establish causation?**
No, and we don't claim any. The index is a planning metric built from distances and counts. It does not estimate how ridership would change after an upgrade. 311 and crash counts are context only, and they mostly track foot traffic and reporting behaviour.

### Limitations and deployment

**16. Entries aren't the number of people who need an elevator.**
Correct. It's an exposure proxy: more entries means more wheelchair users, parents with strollers, older riders and travellers with luggage pass through, assuming those shares are similar across stations. If the MTA has a better measure of need (e.g. paratransit trip origins), it drops straight in as the weight.

**17. What about cost? Elevators at deep stations cost far more.**
There is no cost field in the data, so we optimize benefit per upgrade. With a cost column the problem becomes a budgeted maximum-coverage / knapsack problem. Greedy-by-benefit-per-dollar and the same MILP formulation both handle it, so the code structure doesn't change.

**18. Straight-line distance is unrealistic.**
It understates travel, especially across water or where lines curve. It's applied consistently across stations, so it ranks well, but network travel time would be the first upgrade.

**19. Could this actually be deployed?**
Yes. The inputs are two public MTA tables the agency already maintains, the computation takes seconds, and the app is a static web page with no server. Each capital cycle a planner updates the status file, re-runs the pipeline, excludes infeasible sites and exports the sequence. The outputs are auditable: every recommendation shows its gap, its marginal benefit and who it helps.

**20. What makes this different from a dashboard?**
A dashboard shows data. This tool makes a recommendation, proves it against baselines and the exact optimum, and recomputes it live when policy rules change (budget, equity floor, route rule, exclusions). The map and charts exist to explain the recommendation.

**21. Why does the Bronx get zero upgrades?**
Its ridership-weighted gap (0.90 km) is already lower than Brooklyn's (1.19) or Queens' (1.08), and its demand is smaller. So pure efficiency spends elsewhere first. That is exactly the kind of trade-off a planner should see, and the borough guarantee shows it costs under half a point to fix.

**22. Why did Woodhaven Blvd come out #1?**
14,186 weekday entries, no step-free platform in the snapshot, and the nearest step-free M/R station is 2.4 km away (Jackson Heights–Roosevelt Av). Upgrading it also shortens the detour at Grand Av–Newtown and 63 Dr–Rego Park. If it has been upgraded since the snapshot was taken, mark it step-free and re-run. The app's Exclude button does this live.

**23. Is the interface just decoration? What's real?**
Every number and mark comes from the model or the pipeline outputs. The map draws real station coordinates and the line network from MTA station order. The KPIs, sequence, dossier and two Validation charts re-solve the optimisation live in the browser. A parity test proves the browser model matches the Python model. Counters animate only when the scenario changes, and the header labels the data as historical.

**24. Why build a custom map instead of using Google Maps or Mapbox?**
The rules allow no external datasets, and paid tiles need API keys. A canvas renderer that draws only the provided data stays within the rules, works offline, and renders on demand so it uses no CPU when idle. The whole interface has no runtime libraries.
