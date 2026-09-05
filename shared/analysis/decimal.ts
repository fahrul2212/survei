/** Exact fractions preserve decimal input; rounding is confined to display serialization. */
export type Fraction = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => {
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a < 0n ? -a : a;
};
export function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new Error("Zero denominator");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d) || 1n;
  return { n: n / divisor, d: d / divisor };
}
export function decimal(value: unknown): Fraction | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (text.length > 80 || !/^[-+]?\d+(\.\d+)?([eE][-+]?\d{1,2})?$/.test(text)) return null;
  const [base, exponent = "0"] = text.toLowerCase().split("e");
  const parts = base.split(".");
  const power = Number(exponent) - (parts[1]?.length ?? 0);
  if (Math.abs(power) > 30) return null;
  const n = BigInt(parts.join(""));
  return power >= 0 ? fraction(n * 10n ** BigInt(power)) : fraction(n, 10n ** BigInt(-power));
}
export const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const multiply = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
export const divide = (a: Fraction, b: Fraction) => fraction(a.n * b.d, a.d * b.n);
export const subtract = (a: Fraction, b: Fraction) => add(a, { n: -b.n, d: b.d });
export const compare = (a: Fraction, b: Fraction) =>
  a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export function serialize(value: Fraction, precision = 12): string {
  const scale = 10n ** BigInt(precision),
    abs = value.n < 0n ? -value.n : value.n;
  const rounded = ((abs * scale * 2n) / value.d + 1n) / 2n;
  const digits = rounded.toString().padStart(precision + 1, "0");
  const result = (digits.slice(0, -precision) + "." + digits.slice(-precision)).replace(
    /\.?0+$/,
    "",
  );
  return (value.n < 0n && rounded ? "-" : "") + (result || "0");
}
export function mean(values: Fraction[]) {
  return divide(values.reduce(add, fraction(0n)), fraction(BigInt(values.length)));
}
export function median(values: Fraction[]) {
  const sorted = [...values].sort(compare),
    i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : divide(add(sorted[i - 1], sorted[i]), fraction(2n));
}
