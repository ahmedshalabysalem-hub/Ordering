"use client";

import { useEffect, useRef, useState } from "react";
import { money, pick } from "@/i18n";
import type { PublicGroup, PublicProduct } from "@/server/customer/menu";
import { MAX_QUANTITY } from "../_lib/cart";
import { useLang } from "./lang";
import { Stepper } from "./stepper";

// Product details with option choices, quantity and an item note (SPEC §6.4, §6.5). The price shown
// here is a preview; the server prices the order again at checkout.

export type ProductChoice = { productId: string; optionIds: string[]; quantity: number; note: string };

export function groupHint(group: PublicGroup, t: ReturnType<typeof useLang>["t"]): string {
  if (group.minSelect === 1 && group.maxSelect === 1) return t("product.chooseOne");
  if (group.minSelect === 0) return t("product.chooseUpTo", { max: group.maxSelect });
  return t("product.chooseRange", { min: group.minSelect, max: group.maxSelect });
}

export function ProductSheet({
  product,
  currency,
  onAdd,
  onClose,
}: {
  product: PublicProduct;
  currency: string;
  onAdd: (choice: ProductChoice) => void;
  onClose: () => void;
}) {
  const { lang, t } = useLang();
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      product.groups.map((g) => {
        // Preselect the only sensible choice for a required single choice with one available option.
        const available = g.options.filter((o) => o.isAvailable);
        return [g.id, g.minSelect === 1 && g.maxSelect === 1 && available.length === 1 ? [available[0].id] : []];
      }),
    ),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const toggle = (group: PublicGroup, optionId: string) =>
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (current.includes(optionId)) return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      if (group.maxSelect === 1) return { ...prev, [group.id]: [optionId] };
      if (current.length >= group.maxSelect) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });

  const missing = product.groups.filter((g) => (selected[g.id]?.length ?? 0) < g.minSelect);
  const extras = product.groups.reduce(
    (sum, g) => sum + g.options.filter((o) => selected[g.id]?.includes(o.id)).reduce((s, o) => s + o.priceDeltaMinor, 0),
    0,
  );
  const name = pick(lang, product.nameAr, product.nameEn);
  const description = pick(lang, product.descriptionAr, product.descriptionEn);

  function add() {
    if (missing.length > 0) {
      setShowMissing(true);
      return;
    }
    onAdd({ productId: product.id, optionIds: Object.values(selected).flat(), quantity, note });
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="product-sheet-title"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-0 text-zinc-900 backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="product-sheet-title" className="text-xl font-bold">
            {name}
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={t("product.close")} className="min-h-11 min-w-11 rounded-full text-2xl leading-none text-zinc-500 hover:bg-zinc-100">
            ×
          </button>
        </div>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own media route
          <img src={product.imageUrl} alt="" className="aspect-video w-full rounded-xl object-cover" />
        ) : null}
        {description ? <p className="text-zinc-600">{description}</p> : null}

        {product.groups.map((group) => {
          const groupMissing = showMissing && missing.includes(group);
          return (
            <fieldset key={group.id} className={`rounded-xl border p-3 ${groupMissing ? "border-red-500" : "border-zinc-200"}`}>
              <legend className="px-1 font-semibold">
                {pick(lang, group.nameAr, group.nameEn)}{" "}
                <span className={`text-sm font-normal ${groupMissing ? "text-red-700" : "text-zinc-500"}`}>
                  · {groupHint(group, t)}
                  {group.minSelect > 0 ? ` · ${t("product.required")}` : ""}
                </span>
              </legend>
              <div className="flex flex-col">
                {group.options.map((option) => {
                  const checked = selected[group.id]?.includes(option.id) ?? false;
                  return (
                    <label key={option.id} className={`flex min-h-11 items-center gap-3 py-1 ${option.isAvailable ? "" : "text-zinc-400"}`}>
                      <input
                        type={group.maxSelect === 1 ? "radio" : "checkbox"}
                        name={`group-${group.id}`}
                        checked={checked}
                        disabled={!option.isAvailable}
                        onChange={() => toggle(group, option.id)}
                        onClick={(e) => {
                          // Radios cannot be unticked natively; allow it for optional single choices.
                          if (group.maxSelect === 1 && checked && group.minSelect === 0) {
                            e.preventDefault();
                            toggle(group, option.id);
                          }
                        }}
                        className="size-5 accent-zinc-900"
                      />
                      <span className="flex-1">{pick(lang, option.nameAr, option.nameEn)}</span>
                      <span className="text-sm text-zinc-600">
                        {option.isAvailable ? (option.priceDeltaMinor > 0 ? `+${money(lang, option.priceDeltaMinor, currency)}` : "") : t("product.optionUnavailable")}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("product.note")}
          <input
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("product.notePlaceholder")}
            className="min-h-11 rounded-lg border border-zinc-300 px-3 text-base font-normal"
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{t("product.quantity")}</span>
          <Stepper value={quantity} min={1} max={MAX_QUANTITY} onChange={setQuantity} />
        </div>

        {showMissing && missing.length > 0 ? (
          <p role="alert" className="text-sm text-red-700">
            {t("product.pickRequired", { groups: missing.map((g) => pick(lang, g.nameAr, g.nameEn)).join("، ") })}
          </p>
        ) : null}

        <button type="button" onClick={add} className="min-h-12 rounded-xl bg-zinc-900 px-4 text-base font-semibold text-white hover:bg-zinc-800">
          {t("product.addToCart", { price: money(lang, (product.priceMinor + extras) * quantity, currency) })}
        </button>
      </div>
    </dialog>
  );
}
