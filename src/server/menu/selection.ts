// Server-side check of a customer's option choices for one product (SPEC §6.4). Pure, so order
// creation (ORD-001) can run it on rows it has already loaded inside its transaction.

export type SelectableGroup = {
  id: string;
  nameEn: string;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  options: { id: string; priceDeltaMinor: number; isAvailable: boolean }[];
};

export type SelectionProblem =
  | { kind: "unknown_option"; optionId: string }
  | { kind: "duplicate_option"; optionId: string }
  | { kind: "option_unavailable"; optionId: string }
  | { kind: "too_few"; groupId: string; min: number }
  | { kind: "too_many"; groupId: string; max: number };

export type SelectionResult =
  | { ok: true; optionIds: string[]; modifiersTotalMinor: number }
  | { ok: false; problems: SelectionProblem[] };

/**
 * Validates selected option ids against the product's linked groups. Only active groups count;
 * an option in an inactive or unlinked group is unknown. Returns the per-unit modifier total.
 */
export function checkModifierSelection(groups: SelectableGroup[], selectedOptionIds: string[]): SelectionResult {
  const active = groups.filter((g) => g.isActive);
  const optionGroup = new Map(active.flatMap((g) => g.options.map((o) => [o.id, { group: g, option: o }] as const)));
  const problems: SelectionProblem[] = [];
  const seen = new Set<string>();
  const perGroup = new Map<string, number>();
  let modifiersTotalMinor = 0;

  for (const optionId of selectedOptionIds) {
    if (seen.has(optionId)) {
      problems.push({ kind: "duplicate_option", optionId });
      continue;
    }
    seen.add(optionId);
    const found = optionGroup.get(optionId);
    if (!found) {
      problems.push({ kind: "unknown_option", optionId });
      continue;
    }
    if (!found.option.isAvailable) problems.push({ kind: "option_unavailable", optionId });
    perGroup.set(found.group.id, (perGroup.get(found.group.id) ?? 0) + 1);
    modifiersTotalMinor += found.option.priceDeltaMinor;
  }

  for (const group of active) {
    const chosen = perGroup.get(group.id) ?? 0;
    if (chosen < group.minSelect) problems.push({ kind: "too_few", groupId: group.id, min: group.minSelect });
    if (chosen > group.maxSelect) problems.push({ kind: "too_many", groupId: group.id, max: group.maxSelect });
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, optionIds: [...seen], modifiersTotalMinor };
}
