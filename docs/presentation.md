# StepFree NYC: 5-minute presentation and live demo script

**Format:** about 5:00 talk and demo, then up to 2:00 of judges' questions.
**Setup before you go up:**
- open `app/index.html` (or the hosted link) full-screen on the **Planner** tab, settings at default;
- open the slide deck in a second window;
- zoom the browser to 90% if the projector is low-resolution.

---

## Run of show

| Time | Section | On screen | Who |
|---|---|---|---|
| 0:00–0:40 | The problem | Slides 1–2 | Speaker A |
| 0:40–1:30 | The discovery | Slide 3 (strategy curve) | Speaker A |
| 1:30–2:15 | Method | Slide 4 | Speaker B |
| 2:15–3:45 | **Live demo** | App | Speaker B drives, A narrates |
| 3:45–4:30 | Evidence | Slide 5 *or* app Evidence tab | Speaker A |
| 4:30–5:00 | Impact + limits | Slide 6 | Speaker A |

## Script

### 1. Problem (0:00–0:40)
> "In 2022 the MTA agreed in a legal settlement to make 95% of subway stations accessible by 2055. In the station file we were given, **296 of 424 subway complexes still lack step-free access on at least one route**. That leaves decades of elevator projects, and every capital cycle someone has to decide which stations go next. Our question: **given a budget of K elevators, which stations should be next, and in what order?**"

### 2. Discovery (0:40–1:30)
> "The obvious rule is: upgrade the busiest inaccessible stations first. We tested it. It leaves a lot on the table. Some busy stations already have a step-free station a few blocks away on the same line. Some quieter stations sit on line segments where the nearest step-free stop is 2 or 3 kilometres away.
> With the same 20 upgrades, our plan closes **33.8%** of the accessibility gap. Busiest-first closes **18.9%**. Busiest-first would need **39 upgrades, nearly twice as many**, to match."

### 3. Method (1:30–2:15)
> "We joined MTA ridership to MTA accessibility at the station-complex level, all 424 matched. For each station we measured how far a rider who can't use stairs must travel to reach a step-free station **on the same route**, weighted by weekday entries. We call that the Access Gap Index.
> Choosing K stations to minimize it is a classic facility-location problem. We solve it greedily, which has a mathematical guarantee, and we **checked it against an exact integer program: greedy hit the true optimum at every budget we tried**."

### 4. Live demo (2:15–3:45): click path

| Step | Click | Say |
|---|---|---|
| 1 | Planner at default. Point at the KPI row | "20 upgrades: gap down 33.8%, 79% more than busiest-first, and average detour from 0.97 to 0.64 km." |
| 2 | Click **#3 Classon Av** in the list | "Classon Av on the G ranks 154th by ridership but 3rd here: the nearest step-free G station is 2.8 km away. The orange lines show the neighbouring stations this one upgrade also helps." |
| 3 | Scroll the detail panel to **Street approach** | "From DOT 311 we flag sidewalk, curb and ramp complaints near the station, so the MTA can pair the elevator with a DOT curb check. That's context, not part of the ranking." |
| 4 | Click **Back**, then drag **Stations to upgrade** from 20 to 5, then to 40 | "Planners can see the sequence at any budget. The first five already close 13%." Return the slider to 20. |
| 5 | Set **Borough guarantee: at least 1 per borough** | "The efficient plan gives the Bronx nothing. Guarantee one per borough and we lose under half a point. Equity is almost free." |
| 6 | Click a top station's **Exclude from plan** (e.g. #1 Woodhaven Blvd), show the plan re-optimize, then **Reset to defaults** | "If engineers say a station is infeasible, exclude it and the plan re-optimizes instantly." |
| 7 | Uncheck **Alternative must share a route**, then re-check it | "This is the key policy assumption. If any step-free station counts, the list changes, and we show it rather than hide it." |

### 5. Evidence (3:45–4:30): Evidence tab
> "Is it real? Three checks.
> **Out of sample:** we planned on August only and scored on September. 33.3% versus 33.6% for a plan that saw September.
> **Bootstrap:** resampling days 200 times, 18 of our 20 picks appear over 90% of the time.
> **Sensitivity:** stable to weather (NOAA dry days only), distance caps and the partial-access rule."

### 6. Impact and limits (4:30–5:00)
> "If the MTA used this, they would get a defensible, auditable sequence that can be re-run each capital cycle, with equity rules and engineering exclusions built in.
> Limits we're upfront about: entries are a proxy for who needs step-free access, distance is straight-line, we only see the origin side of trips, and there's no cost data. Add a cost column and the same code becomes a budget knapsack. Thank you."

---

## Backup if the demo fails
- Static figures are in `outputs/figures/`, and README section 5 has every table.
- `docs/img/` has screenshots of each app view.
