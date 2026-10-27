import { describe, expect, it } from "vitest";
import { checkModifierSelection, type SelectableGroup } from "@/server/menu/selection";

const size: SelectableGroup = {
  id: "size",
  nameEn: "Size",
  minSelect: 1,
  maxSelect: 1,
  isActive: true,
  options: [
    { id: "small", priceDeltaMinor: 0, isAvailable: true },
    { id: "large", priceDeltaMinor: 1000, isAvailable: true },
    { id: "huge", priceDeltaMinor: 2000, isAvailable: false },
  ],
};
const extras: SelectableGroup = {
  id: "extras",
  nameEn: "Extras",
  minSelect: 0,
  maxSelect: 2,
  isActive: true,
  options: [
    { id: "shot", priceDeltaMinor: 750, isAvailable: true },
    { id: "milk", priceDeltaMinor: 500, isAvailable: true },
    { id: "syrup", priceDeltaMinor: 600, isAvailable: true },
  ],
};
const retired: SelectableGroup = { ...extras, id: "retired", isActive: false, options: [{ id: "old", priceDeltaMinor: 100, isAvailable: true }] };

describe("modifier selection check (SPEC §6.4)", () => {
  it("accepts a valid choice and totals the extra prices", () => {
    expect(checkModifierSelection([size, extras], ["large", "shot", "milk"])).toEqual({
      ok: true,
      optionIds: ["large", "shot", "milk"],
      modifiersTotalMinor: 2250,
    });
    expect(checkModifierSelection([size, extras], ["small"])).toMatchObject({ ok: true, modifiersTotalMinor: 0 });
  });

  it("enforces required groups and maximums", () => {
    expect(checkModifierSelection([size, extras], [])).toEqual({ ok: false, problems: [{ kind: "too_few", groupId: "size", min: 1 }] });
    expect(checkModifierSelection([size], ["small", "large"])).toEqual({ ok: false, problems: [{ kind: "too_many", groupId: "size", max: 1 }] });
    expect(checkModifierSelection([size, extras], ["small", "shot", "milk", "syrup"])).toMatchObject({
      ok: false,
      problems: [{ kind: "too_many", groupId: "extras", max: 2 }],
    });
  });

  it("refuses unavailable, duplicate, foreign and inactive-group options", () => {
    expect(checkModifierSelection([size], ["huge"])).toEqual({ ok: false, problems: [{ kind: "option_unavailable", optionId: "huge" }] });
    expect(checkModifierSelection([size, extras], ["small", "shot", "shot"])).toEqual({
      ok: false,
      problems: [{ kind: "duplicate_option", optionId: "shot" }],
    });
    expect(checkModifierSelection([size], ["small", "made-up"])).toEqual({ ok: false, problems: [{ kind: "unknown_option", optionId: "made-up" }] });
    expect(checkModifierSelection([size, retired], ["small", "old"])).toEqual({ ok: false, problems: [{ kind: "unknown_option", optionId: "old" }] });
  });

  it("ignores an inactive group's minimum", () => {
    expect(checkModifierSelection([{ ...size, isActive: false }], [])).toEqual({ ok: true, optionIds: [], modifiersTotalMinor: 0 });
  });
});
