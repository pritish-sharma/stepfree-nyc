/**
 * Initialisation sequence (~1.9 s): grid → identity → scan line → system log
 * built from real pipeline facts → reveal. Skippable (click / any key), skipped
 * entirely under reduced motion and on reloads within the same browser session.
 */
import { fmtInt } from "./format.js";
import { reducedMotion } from "./motion.js";

const SEEN_KEY = "stepfree.boot.seen";

export const LOGO = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <circle class="ring" cx="16" cy="16" r="13" stroke="#4fd1ff" stroke-width="1.4" stroke-opacity="0.9"/>
  <path d="M9 21h4v-4h4v-4h4v-4h2" stroke="#e7f1f5" stroke-width="1.8" stroke-linejoin="miter"/>
  <circle cx="23" cy="9" r="1.8" fill="#ffb547"/>
</svg>`;

export function runBoot(data, onReveal) {
  let seen = false;
  try { seen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch { /* storage blocked: show boot */ }
  if (reducedMotion() || seen) { onReveal(); return; }

  const p = data.profile, m = data.metrics;
  const lines = [
    ["LOAD MTA RIDERSHIP", `${fmtInt(p.ridership.rows)} rows`],
    ["LINK ACCESSIBILITY SNAPSHOT", `${p.join.matched_to_accessibility}/${p.join.ridership_complexes}`],
    ["BUILD ACCESS GAP INDEX", `${m.setup.n_candidates} candidates`],
    ["SOLVE FACILITY-LOCATION · K=20", "optimal"],
  ];
  const el = document.createElement("div");
  el.className = "boot";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Initialising StepFree NYC");
  el.innerHTML = `<div class="boot-grid"></div><div class="boot-scan"></div>
    <div class="boot-core">
      <div class="boot-mark">${LOGO}</div>
      <div class="boot-title">Step<b>Free</b> · NYC</div>
      <div class="boot-bar"><i></i></div>
      <div class="boot-log"></div>
    </div>
    <div class="boot-skip">Click or press any key to skip</div>`;
  document.body.appendChild(el);

  const log = el.querySelector(".boot-log");
  const timers = lines.map(([k, v], i) => setTimeout(() => {
    const row = document.createElement("div");
    row.innerHTML = `› ${k} <span>${v}</span>`;
    log.appendChild(row);
  }, 420 + i * 290));

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    clearTimeout(end);
    el.classList.add("done");
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    window.removeEventListener("keydown", finish);
    onReveal();
    setTimeout(() => el.remove(), 600);
  };
  const end = setTimeout(finish, 1950);
  el.addEventListener("click", finish);
  window.addEventListener("keydown", finish);
}
