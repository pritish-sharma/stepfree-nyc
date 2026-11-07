/**
 * Minimal observable store. State changes go through `set`, which notifies
 * subscribers once per animation frame (batched), so a slider drag never
 * triggers more than one recompute + render per frame.
 */
export function createStore(initial) {
  let state = { ...initial };
  const subs = new Set();
  let pending = null;
  let changed = new Set();

  function flush() {
    pending = null;
    const keys = changed;
    changed = new Set();
    for (const fn of subs) fn(state, keys);
  }

  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      for (const k of Object.keys(next)) if (state[k] !== next[k]) changed.add(k);
      if (!changed.size) return;
      state = { ...state, ...next };
      if (!pending) pending = requestAnimationFrame(flush);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
