export const fmtInt = (x) => Math.round(x).toLocaleString("en-US");
export const fmtK = (x) => (Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(2) + "M" : Math.abs(x) >= 1e3 ? (x / 1e3).toFixed(0) + "k" : fmtInt(x));
export const fmtKm = (x, d = 2) => `${x.toFixed(d)} km`;
export const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
export const signedPct = (x, d = 0) => `${x >= 0 ? "+" : "−"}${Math.abs(100 * x).toFixed(d)}%`;
export const shortName = (name) => name.replace(/\s*\([^)]*\)\s*$/, "");
export const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
