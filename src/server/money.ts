// Money is integer minor units everywhere (CLAUDE.md rule 5, ADR-007): bigint in PostgreSQL and a safe
// integer in TypeScript. These helpers convert between that and the decimal text staff type and read,
// using string operations only, so no amount ever passes through a fractional float.

export class MoneyError extends Error {}

/** Decimal places of a currency's minor unit, e.g. 2 for EGP, 0 for JPY, 3 for KWD. */
export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Parses "45", "45.5" or "45.50" into minor units. Rejects negatives, junk and extra decimal places. */
export function parseMoney(text: string, currency: string): number {
  const digits = currencyDigits(currency);
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(text.trim().replace(/,/g, ""));
  if (!match) throw new MoneyError("Enter a price like 45.50.");
  const [, whole, fraction = ""] = match;
  if (fraction.length > digits) throw new MoneyError(`Use at most ${digits} decimal places.`);
  return Number(whole + fraction.padEnd(digits, "0"));
}

/** Formats minor units as plain decimal text ("45.50"), the inverse of parseMoney. */
export function minorToDecimal(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new MoneyError("Money amounts must be whole minor units.");
  const digits = currencyDigits(currency);
  const abs = Math.abs(minor).toString().padStart(digits + 1, "0");
  const text = digits === 0 ? abs : `${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
  return minor < 0 ? `-${text}` : text;
}

/** Formats minor units for display with the currency, e.g. "EGP 45.50". */
export function formatMoney(minor: number, currency: string, locale = "en"): string {
  // Intl formats a decimal string exactly, so the amount never becomes a fractional float.
  const decimal = minorToDecimal(minor, currency) as `${number}`;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(decimal);
}
