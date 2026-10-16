/**
 * Provider-edge conversions only. Inside ARO money is always an integer
 * amount of minor units plus an ISO-4217 currency.
 */

/** 1190 → 11.9 for providers whose API takes decimal major units (2-decimal currencies). */
export function minorToMajor(minor: number): number {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("invalid minor amount");
  return Number((minor / 100).toFixed(2));
}

/**
 * 11.9 / "11.90" → 1190. Parses the decimal text instead of multiplying floats,
 * and rejects more than 2 decimal places rather than rounding silently.
 */
export function majorToMinor(major: number | string): number {
  const text = typeof major === "number" ? major.toString() : major.trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) throw new Error(`invalid major amount: ${text}`);
  const minor = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) throw new Error("amount out of range");
  return minor;
}
