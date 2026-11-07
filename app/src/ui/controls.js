/** Reusable control behaviours. */

/** Segmented control: moves the sliding plate under the pressed button. */
export function syncSegmented(seg) {
  const plate = seg.querySelector(".seg-plate");
  const btn = seg.querySelector('button[aria-pressed="true"]');
  if (!plate || !btn) return;
  plate.style.width = `${btn.offsetWidth}px`;
  plate.style.transform = `translateX(${btn.offsetLeft - 2}px)`;
}

export function segmented(seg, value, onChange) {
  const set = (v) => {
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === String(v)));
    syncSegmented(seg);
  };
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    set(b.dataset.value);
    onChange(b.dataset.value);
  });
  new ResizeObserver(() => syncSegmented(seg)).observe(seg);
  set(value);
  return set;
}

/** Range input: keeps the filled-track CSS variable in sync. */
export function syncRange(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty("--fill", `${p}%`);
}
