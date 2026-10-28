"use client";

import { money, pick } from "@/i18n";
import type { PublicMenu, PublicProduct } from "@/server/customer/menu";
import type { ItemProblem, Quote } from "@/server/orders/create";
import { type Cart, MAX_QUANTITY } from "../_lib/cart";
import { useLang } from "./lang";
import { Stepper } from "./stepper";

// Cart review and checkout (SPEC §6.5, §6.7). Every amount here comes from the server quote.

export type QuoteState =
  | { status: "loading"; quote: Quote | null }
  | { status: "ok"; quote: Quote }
  | { status: "problems"; quote: Quote | null; problems: ItemProblem[] }
  | { status: "error"; quote: Quote | null; message: string };

export type SubmitState = { status: "idle" | "sending" } | { status: "error"; message: string } | { status: "prices_changed" };

export function CartView({
  cart,
  menu,
  products,
  quote,
  submit,
  onQuantity,
  onNote,
  onBack,
  onSubmit,
}: {
  cart: Cart;
  menu: PublicMenu;
  products: Map<string, PublicProduct>;
  quote: QuoteState;
  submit: SubmitState;
  onQuantity: (lineId: string, quantity: number) => void;
  onNote: (note: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { lang, t } = useLang();
  const m = (minor: number) => money(lang, minor, menu.currency);
  const shown = quote.quote;
  const totals = quote.status === "ok" ? quote.quote.totals : null;
  const problems = quote.status === "problems" ? quote.problems : [];

  const problemText = (index: number) => {
    const p = problems.filter((x) => x.itemIndex === index);
    if (p.length === 0) return null;
    if (p.some((x) => x.kind === "product_unavailable")) return t("error.unavailable");
    if (p.some((x) => x.kind === "product_sold_out")) return t("error.soldOut");
    return t("error.options");
  };

  return (
    <section aria-labelledby="cart-title" className="flex flex-col gap-4 pb-40">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="min-h-11 rounded-full border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100">
          {lang === "ar" ? "→" : "←"} {t("cart.back")}
        </button>
        <h2 id="cart-title" className="text-xl font-bold">
          {t("cart.title")}
        </h2>
      </div>

      {cart.lines.length === 0 ? <p className="py-10 text-center text-zinc-500">{t("cart.empty")}</p> : null}

      <ul className="flex flex-col divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
        {cart.lines.map((line, index) => {
          const product = products.get(line.productId);
          const name = product ? pick(lang, product.nameAr, product.nameEn) : t("error.unavailable");
          const options = product
            ? product.groups.flatMap((g) => g.options.filter((o) => line.optionIds.includes(o.id)).map((o) => pick(lang, o.nameAr, o.nameEn)))
            : [];
          const priced = quote.status === "ok" ? quote.quote.lines[index] : undefined;
          const problem = problemText(index);
          return (
            <li key={line.id} className="flex flex-col gap-2 p-4" data-testid="cart-line">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-semibold">{name}</span>
                  {options.length > 0 ? <span className="text-sm text-zinc-600">{options.join("، ")}</span> : null}
                  {line.note ? <span className="text-sm text-zinc-500">“{line.note}”</span> : null}
                </div>
                <span className="font-semibold tabular-nums">{priced ? m(priced.lineTotalMinor) : ""}</span>
              </div>
              {problem ? (
                <p role="alert" className="text-sm font-medium text-red-700">
                  {problem}
                </p>
              ) : null}
              <div className="flex items-center justify-between">
                <Stepper value={line.quantity} min={0} max={MAX_QUANTITY} onChange={(q) => onQuantity(line.id, q)} label={name} />
                <button
                  type="button"
                  onClick={() => onQuantity(line.id, 0)}
                  aria-label={t("cart.removeNamed", { name })}
                  className="min-h-11 px-3 text-sm font-medium text-red-700 hover:underline"
                >
                  {t("cart.remove")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {cart.lines.length > 0 ? (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("cart.orderNote")}
            <textarea
              value={cart.customerNote}
              maxLength={500}
              rows={2}
              onChange={(e) => onNote(e.target.value)}
              placeholder={t("cart.orderNotePlaceholder")}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-base font-normal"
            />
          </label>

          <dl className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-4" aria-busy={quote.status === "loading"}>
            {totals ? (
              <>
                <Row label={t("cart.subtotal")} value={m(totals.subtotalMinor)} />
                {totals.discountMinor > 0 ? <Row label={t("cart.discount")} value={`−${m(totals.discountMinor)}`} /> : null}
                {menu.hasTax || totals.taxMinor > 0 ? (
                  <Row label={menu.pricesIncludeTax ? `${t("cart.tax")} (${t("cart.taxIncluded")})` : t("cart.tax")} value={m(totals.taxMinor)} />
                ) : null}
                {totals.serviceMinor > 0 ? <Row label={t("cart.service")} value={m(totals.serviceMinor)} /> : null}
                <Row label={t("cart.total")} value={m(totals.totalMinor)} strong testId="cart-total" />
              </>
            ) : (
              <p className="text-sm text-zinc-500">{quote.status === "error" ? quote.message : quote.status === "loading" ? t("cart.calculating") : ""}</p>
            )}
          </dl>

          <div role="alert" aria-live="assertive" className="text-sm font-medium text-red-700 empty:hidden">
            {submit.status === "error" ? submit.message : submit.status === "prices_changed" ? t("error.pricesChanged") : ""}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur">
            <div className="mx-auto flex max-w-xl flex-col gap-2">
              <button
                type="button"
                onClick={onSubmit}
                disabled={!totals || submit.status === "sending"}
                className="min-h-12 rounded-xl bg-emerald-600 px-4 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submit.status === "sending"
                  ? t("cart.placing")
                  : submit.status === "prices_changed" && shown
                    ? t("error.confirmNewTotal", { price: m(shown.totals.totalMinor) })
                    : submit.status === "error"
                      ? t("cart.retry")
                      : t("cart.placeOrder", { price: totals ? m(totals.totalMinor) : "…" })}
              </button>
              <p className="text-center text-xs text-zinc-500">{t("cart.payNote")}</p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Row({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-zinc-200 pt-2 text-lg font-bold" : "text-zinc-700"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
