import type { FormatOptions } from "./types.js";

export function formatCurrency(
  amount: number,
  options: FormatOptions = {},
): string {
  const { currency = "EUR" } = options;
  const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency;
  const abs = Math.abs(amount);
  return amount < 0 ? `-${symbol}${abs}` : `${symbol}${abs}`;
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}
