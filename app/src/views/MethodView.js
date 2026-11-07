/** METHOD — system documentation: decision, data, model, evaluation, limits. */
import { html, mount } from "../ui/dom.js";

export function MethodView(root, { data }) {
  const s = data.metrics.setup;
  mount(root, html`<div class="view-pad"><div class="method">
    <nav class="toc" aria-label="Sections">
      <a href="#m-decision">Decision</a><a href="#m-data">Data &amp; joins</a><a href="#m-model">Model</a>
      <a href="#m-eval">Evaluation</a><a href="#m-limits">Limitations</a><a href="#m-sources">Sources</a>
    </nav>
    <article class="doc">
      <h2 id="m-decision">The decision this system supports</h2>
      <p>Under a 2022 legal settlement the MTA agreed to make 95% of subway stations accessible by 2055. Each capital cycle therefore has to answer one question: <b>given a budget of K upgrades, which station complexes should be made step-free next, and in what order?</b> StepFree answers it with a transparent optimisation model, checks the answer against simple rules and the exact optimum, and lets a planner change the policy assumptions and see the consequences immediately.</p>
      <p>All data is <b>historical</b> (August 1 – September 30, 2025). Nothing in this interface is a live feed. Animated values change only when you change the scenario.</p>

      <h2 id="m-data">Data and joins</h2>
      <ul>
        <li><b>MTA station-complex daily ridership</b>: 424 complexes × 61 days. Demand weight = mean weekday entries (Labor Day excluded). Entries are estimates of station entries, not crowding or exits.</li>
        <li><b>MTA station accessibility</b>: 496 stop rows aggregated to complexes. It is a <b>recent snapshot</b>, which is the right input for a forward-looking plan; it is never used to explain 2025 ridership. The 21 Staten Island Railway stations have no ridership and drop out.</li>
        <li><b>NOAA daily weather</b>: flags 10 wet days so demand can be re-estimated from dry days only (robustness check).</li>
        <li><b>NYC 311 DOT requests</b> and <b>NYPD collisions</b>: counted within 400 m of each complex as street-approach context. Not used in the ranking.</li>
        <li><b>Map network</b>: lines join consecutive stops in MTA station order within each line in the accessibility file, with jumps over 2.6 km omitted. It is a schematic drawn from the provided data, not track geometry.</li>
      </ul>
      <p>Every join happens at the station-complex level (one row per complex), so no many-to-many join can inflate counts.</p>

      <h2 id="m-model">Model</h2>
      <span class="formula">For complex i:  R(i) routes · A(i) routes with a step-free platform · U(i) = R(i) − A(i)
u(i)  = weekday entries(i) × |U(i)| / |R(i)|          entries on routes without step-free access
d0(i) = km to nearest complex j with A(j) ∩ U(i) ≠ ∅   current gap (capped at 5 km)
After upgrading set S:
d(i)  = min( d0(i), min over j ∈ S with R(j) ∩ U(i) ≠ ∅ of km(i, j) )

Access Gap Index  G(S) = Σ u(i) · d(i)      choose |S| = K to minimise G</span>
      <p>This is a facility-location (p-median type) problem. Its benefit function is monotone submodular, so the greedy algorithm carries a (1 − 1/e) ≈ 63% guarantee. The pipeline also solves the exact MILP with SciPy's HiGHS solver; greedy matched the optimum for K = 5, 10, 20 and 30. The coverage objective instead maximises Σ u(i)·1[d(i) ≤ T]. The borough guarantee is a quota-constrained greedy. ${s.n_candidates} complexes are candidates.</p>
      <p>The interface runs a JavaScript port of the Python model in the browser. An automated test confirms it reproduces the Python plan and metrics.</p>

      <h2 id="m-eval">Evaluation</h2>
      <ul>
        <li><b>Baselines:</b> busiest-first, most unmet entries first, stand-alone score, and 500 random orders.</li>
        <li><b>Optimality:</b> exact MILP at K = 5, 10, 20, 30.</li>
        <li><b>Chronological hold-out:</b> plan on August weekdays, score on September weekdays.</li>
        <li><b>Bootstrap:</b> 200 resamples of weekdays; frequency each complex appears in the top 20.</li>
        <li><b>Sensitivity:</b> route rule, partial-access rule, distance cap, dry-day and weekend weights.</li>
      </ul>

      <h2 id="m-limits">Limitations</h2>
      <ul class="limit">
        <li><b>Entries are a proxy for need.</b> The data does not say how many riders need step-free access; the index measures exposure, not the number of disabled riders.</li>
        <li><b>Straight-line distance.</b> Street-network and in-system travel time would be more accurate.</li>
        <li><b>Origin side only.</b> A rider also needs a step-free destination.</li>
        <li><b>Equal split at partial complexes.</b> Route-level ridership is not available.</li>
        <li><b>No cost data.</b> The model optimises benefit per upgrade, not per dollar. With a cost column it becomes a budgeted knapsack with the same structure.</li>
        <li><b>Snapshot accessibility.</b> Upgrades after the snapshot, projects under way and elevator outages are not modelled. Planners should refresh the status file before use.</li>
        <li><b>Two summer months of demand.</b> The Aug→Sep stability test is reassuring; a full year would be better.</li>
        <li><b>Context layers are not causal.</b> 311 requests and crashes reflect reporting behaviour and foot traffic.</li>
      </ul>

      <h2 id="m-sources">Sources</h2>
      <p>MTA Subway Hourly Ridership (data.ny.gov 5wq4-mkjj) · MTA Subway Stations (data.ny.gov 39hk-dx4f) · NYC 311 Service Requests (data.cityofnewyork.us erm2-nwe9) · NYPD Motor Vehicle Collisions (h9gi-nx95) · NOAA NCEI Daily Summaries. All supplied in the Rutgers DSC NYC in Motion repository. No external data.</p>
    </article>
  </div></div>`);
  // keep TOC links from rewriting the router hash
  root.querySelector(".toc").addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    root.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return { update() {} };
}
