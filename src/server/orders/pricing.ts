// Order pricing (ADR-012). Pure and integer-only: amounts are minor units, intermediate products use
// BigInt, and every division rounds half-up. No floating point is involved anywhere.

export type PricedLineInput = { unitPriceMinor: number; modifiersTotalMinor: number; quantity: number };

export type PricingSettings = {
  /** Sum of the branch's active tax rates, in basis points (1400 = 14%). */
  taxBps: number;
  pricesIncludeTax: boolean;
  serviceChargeBps: number;
};

export type OrderTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceMinor: number;
  totalMinor: number;
};

export class PricingError extends Error {}

const toSafe = (value: bigint): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new PricingError("Amount is too large.");
  return Number(value);
};

/** round_half_up(numerator / denominator) for non-negative integers. */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new PricingError("Rounding needs non-negative amounts.");
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function lineTotalMinor({ unitPriceMinor, modifiersTotalMinor, quantity }: PricedLineInput): number {
  return toSafe((BigInt(unitPriceMinor) + BigInt(modifiersTotalMinor)) * BigInt(quantity));
}

export function priceOrder(lines: PricedLineInput[], settings: PricingSettings): OrderTotals {
  const gross = lines.reduce((sum, line) => sum + BigInt(lineTotalMinor(line)), 0n);
  const bps = BigInt(settings.taxBps);

  let net: bigint;
  let tax: bigint;
  if (settings.pricesIncludeTax) {
    // Menu prices already contain tax: split the gross into net + tax.
    net = divideHalfUp(gross * 10000n, 10000n + bps);
    tax = gross - net;
  } else {
    net = gross;
    tax = divideHalfUp(gross * bps, 10000n);
  }
  const service = divideHalfUp(net * BigInt(settings.serviceChargeBps), 10000n);

  return {
    subtotalMinor: toSafe(net),
    discountMinor: 0,
    taxMinor: toSafe(tax),
    serviceMinor: toSafe(service),
    totalMinor: toSafe(net + tax + service),
  };
}
