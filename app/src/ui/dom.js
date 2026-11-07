/** Tiny DOM helpers. `html` escapes interpolated values; use `raw()` to opt out for trusted markup. */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(v) { this.v = v; } toString() { return this.v; } }
export const raw = (v) => new Raw(v);

export function html(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (v instanceof Raw) out += v.v;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.v : esc(x))).join("");
      else out += esc(v);
    }
  });
  return raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(el, markup) {
  el.innerHTML = markup instanceof Raw ? markup.v : String(markup);
  return el;
}

/** Delegated event listener. */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}
