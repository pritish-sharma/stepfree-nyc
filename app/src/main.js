/**
 * StepFree NYC — application entry.
 *
 * Architecture
 *   core/   model (pure maths) · scenario engine · store
 *   ui/     design-system primitives: motion, tooltip, controls, map renderer, charts, panels
 *   views/  COMMAND · VALIDATION · DATA EXPLORER · METHOD — each renders engine output
 *
 * Data flow: controls → store.set() → (one rAF later) engine.run(state) → visible views update.
 * Hidden views are marked dirty and refresh when shown, so off-screen work never runs.
 */
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/views.css";

import { createStore } from "./core/store.js";
import { createEngine, DEFAULTS, isDefaultScenario } from "./core/scenario.js";
import { CommandView } from "./views/CommandView.js";
import { ValidationView } from "./views/ValidationView.js";
import { ExplorerView } from "./views/ExplorerView.js";
import { MethodView } from "./views/MethodView.js";
import { runBoot, LOGO } from "./ui/boot.js";
import { toast, hideTooltip } from "./ui/tooltip.js";

const VIEWS = ["command", "validation", "explorer", "method"];

function fatal(message) {
  const el = document.createElement("div");
  el.className = "fatal";
  el.innerHTML = `<div><b>System fault</b>${message}</div>`;
  document.body.appendChild(el);
}

function start() {
  const data = window.STEPFREE;
  if (!data || !Array.isArray(data.stations)) {
    fatal("The data bundle (data.js) did not load. Run <code>./run_all.sh</code> from the repository root, then reload.");
    return;
  }

  document.querySelector(".brand").insertAdjacentHTML("afterbegin", LOGO);
  const engine = createEngine(data);
  const store = createStore({ ...DEFAULTS, exclude: new Set(), selected: null, layer: "status", view: null, _fly: null });

  const roots = Object.fromEntries(VIEWS.map((v) => [v, document.getElementById(`view-${v}`)]));
  const views = {
    command: CommandView(roots.command, { store, engine, data }),
    validation: ValidationView(roots.validation, { engine, data }),
    explorer: ExplorerView(roots.explorer, {
      engine, data,
      onOpen: (i) => { store.set({ view: "command", selected: i, _fly: Symbol() }); },
    }),
    method: MethodView(roots.method, { data }),
  };
  const dirty = new Set(VIEWS);
  let result = null;
  let lastModelKey = "";

  // ---- navigation ------------------------------------------------------------
  const nav = document.querySelector(".nav");
  const indicator = nav.querySelector(".nav-indicator");
  const moveIndicator = () => {
    const b = nav.querySelector('button[aria-selected="true"]');
    if (!b) return;
    indicator.style.width = `${b.offsetWidth}px`;
    indicator.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  nav.addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) store.set({ view: b.dataset.view }); });
  nav.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = VIEWS.indexOf(store.get().view) + (e.key === "ArrowRight" ? 1 : -1);
    const v = VIEWS[(i + VIEWS.length) % VIEWS.length];
    store.set({ view: v });
    nav.querySelector(`[data-view="${v}"]`).focus();
  });
  window.addEventListener("hashchange", () => {
    const v = location.hash.slice(1);
    if (VIEWS.includes(v)) store.set({ view: v });
  });
  new ResizeObserver(moveIndicator).observe(nav);

  function showView(v) {
    for (const b of nav.querySelectorAll("button")) b.setAttribute("aria-selected", String(b.dataset.view === v));
    for (const k of VIEWS) roots[k].classList.toggle("is-hidden", k !== v);
    moveIndicator();
    hideTooltip();
    if (location.hash !== `#${v}`) history.replaceState(null, "", `#${v}`);
    if (v === "command") views.command.onShow();
  }

  // ---- reactive update loop ---------------------------------------------------
  store.subscribe((state, keys) => {
    try {
      const modelKey = [state.K, state.mode, state.T, state.floor, state.weight, state.sameRoute, state.lenient, [...state.exclude].join(",")].join("|");
      const modelChanged = modelKey !== lastModelKey;
      if (modelChanged) { result = engine.run(state); lastModelKey = modelKey; VIEWS.forEach((v) => dirty.add(v)); }
      if (keys.has("view")) showView(state.view);
      const isDefault = isDefaultScenario(state);
      if (state.view === "command" || modelChanged) {
        views.command.update(state, result, keys, isDefault);
        dirty.delete("command");
      }
      if (state.view !== "command" && dirty.has(state.view)) {
        views[state.view].update(state, result, keys, isDefault);
        dirty.delete(state.view);
      }
    } catch (err) {
      console.error(err);
      toast("Something went wrong recomputing this scenario. Reset the scenario to recover.", { error: true });
    }
  });

  // ---- initial state ------------------------------------------------------------
  const initialView = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "command";
  store.set({ view: initialView, _init: true });

  runBoot(data, () => {
    document.body.classList.add("ready");
    requestAnimationFrame(() => views.command.intro());
  });
}

try { start(); } catch (err) { console.error(err); fatal(`The interface failed to start: ${String(err && err.message ? err.message : err)}`); }
