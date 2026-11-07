/** Single shared tooltip element, positioned to stay inside the viewport. */
let el = null;

function ensure() {
  if (!el) {
    el = document.createElement("div");
    el.className = "tooltip";
    el.setAttribute("role", "tooltip");
    document.body.appendChild(el);
  }
  return el;
}

export function showTooltip(markup, x, y) {
  const t = ensure();
  t.innerHTML = String(markup);
  t.classList.add("on");
  const pad = 14;
  const w = t.offsetWidth, h = t.offsetHeight;
  let left = x + pad, top = y + pad;
  if (left + w > innerWidth - 8) left = x - w - pad;
  if (top + h > innerHeight - 8) top = y - h - pad;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${Math.max(8, top)}px`;
}

export function hideTooltip() { el?.classList.remove("on"); }

let toastEl = null, toastTimer = 0;
export function toast(message, { error = false, ms = 2600 } = {}) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.toggle("err", error);
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), ms);
}
