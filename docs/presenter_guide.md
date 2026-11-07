# StepFree NYC keynote: presenter guide

**File:** `presentation/index.html`. It is one self-contained file with fonts, data and the screenshot embedded, so it needs no internet and no install.
**Backup:** `presentation/StepFree_NYC_Keynote.pdf`, which shows every slide in its final state. A PDF cannot animate.
**Rebuild after the pipeline changes:** `python3 presentation/build.py`. Every number on the slides is read from `outputs/` or recomputed with `pipeline/stepfree.py`.

## Before you go up
1. Open `presentation/index.html` in Chrome or Edge on the presenting laptop, then press **F** for fullscreen.
2. Open `app/index.html` in a second window, on the **Command** tab, ready for the live demo.
3. Press **R** to replay the opening, so it runs fresh when you start.
4. Optional: press **T** for a rehearsal timer (amber, bottom right) and **N** for speaker notes. Press N again to hide the notes before the audience sees the screen.

## Controls
| Key | Action |
|---|---|
| → · Space · Enter · Page Down · click | Next reveal, or next slide when the current one is complete |
| ← · Page Up · click on the left fifth of the screen | Previous slide, shown complete |
| 1–9 | Jump to that slide, shown complete |
| Home / End | First / last slide |
| N | Speaker notes overlay (shows slide, beat and script) |
| T | Rehearsal timer |
| F | Fullscreen |
| R | Restart the opening sequence |

Most clickers send Page Down and Page Up, so they work out of the box. Pressing → during the opening completes it instantly.

## Motion language (what the audience sees)
- **Headlines** reveal line by line through a mask, about 1 s.
- **Statements** rise word by word.
- **System annotations** (mono text) type out character by character, with a cursor that disappears when the line finishes. Only the "→ live demo" cue keeps its cursor.
- **Numbers** count up to their computed value once, when revealed.
- **Maps** use real station coordinates. Stations illuminate outward from the centre and links draw from station to station.
- **Slide transitions:** the old slide drifts out with a slight blur and the new one settles in, 0.7–1.1 s, with the same easing everywhere.

## Run of show: about 5 minutes, 30 presses

| # | Slide | Presses | Time | What appears on each press | Say |
|---|---|---|---|---|---|
| 1 | Opening | auto (≈5 s) | 0:00–0:25 | grid → identity types → scan line → title → network draws → data line | "In 2022 the MTA agreed to make 95% of stations accessible by 2055. Every capital cycle someone decides which stations go next. Which should?" |
| 2 | The problem | 4 | 0:25–1:00 | map lights · **296 / 424** counts up, inaccessible stations highlight · **0.97 km**, real nearest-alternative links draw · 2055 annotation types | "296 of 424 complexes lack step-free access on at least one route… almost a kilometre to a usable station." |
| 3 | The obvious rule | 2 | 1:00–1:25 | 20 busiest candidates ring up in ridership order · detour comparison **0.72 km vs 1.26 km**, 8/20 overlap | "Busy stations often already have a step-free option nearby on the same line." |
| 4 | The discovery | 4 | 1:25–2:05 | axes · busiest-first line draws, **18.9%** · optimiser draws, **33.8%**, random band · amber line runs from K=20 to **K=39** | "Same budget, 79% more of the gap closed. Busiest-first needs 39 upgrades to match 20." |
| 5 | Why it works | 3 | 2:05–2:35 | Classon Av zoom, 4,080 entries, rank #154 · link to Metropolitan Av/Lorimer St, **2.84 km** · amber links to 4 G-line neighbours, **#3** | "That's why the 154th busiest is our #3." |
| 6 | Method | 4 | 2:35–3:05 | data nodes + edges · Access Gap Index + formula types · optimiser + exact MILP · NOAA/311/NYPD + planner | "Facility-location model, greedy with a 63% guarantee, and the exact integer program shows it's optimal." |
| 7 | Evidence | 5 | 3:05–3:40 | headline · **4/4** optimal · hold-out bars **18.2 / 33.3 / 33.6** · **18/20** bootstrap dots · sensitivity table | "Four tests. The recommendation holds." |
| 8 | Equity | 3 | 3:40–4:05 | borough bars grow · Bronx row turns amber, **0** upgrades · **−0.46 pts** to guarantee every borough | "Equity is almost free." |
| 9 | The planner | 1 | 4:05 | screenshot + feature list, "→ live demo" | Switch to the app (about 60–90 s, or cut to 30 s if over time) |
| 10 | Impact & limits | 2 | 4:35–4:50 | what it changes · what the data can't tell us | Keep it honest and short. |
| 11 | Close | 1 | 4:50–5:00 | map dims, the 20 recommended stations ring up in order, closing statement | "Same budget. Nearly twice the access. Thank you." |

If you are running long, skip slide 6 (press **7**) and say the method in one sentence on slide 5.

## Team and repository
Slides 1 and 11 show **Pritish Sharma** and **github.com/pritish-sharma/stepfree-nyc**. To change them, edit `presentation/src/deck.html` and run `python3 presentation/build.py`.

## Accuracy notes for Q&A
- "Nearly twice the access" on the closing slide means 33.8% vs 18.9% of the Access Gap Index closed (×1.79). The discovery slide states the exact figure: 79% more.
- 0.72 km vs 1.26 km on slide 3 is the entry-weighted current gap at each strategy's own 20 stations, computed in `presentation/build.py`.
- The map's line network is schematic: consecutive stops in MTA station order, with jumps over 2.6 km dropped. It is drawn from the provided data, not track geometry.
- All data is historical (Aug–Sep 2025), as the slide header says.
