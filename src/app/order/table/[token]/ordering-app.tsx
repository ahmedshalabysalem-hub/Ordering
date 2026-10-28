"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, pick, type Translate } from "@/i18n";
import type { PublicMenu, PublicProduct } from "@/server/customer/menu";
import { AssistButton } from "../../_components/assist-button";
import { CartView, type QuoteState, type SubmitState } from "../../_components/cart-view";
import { LangSwitch, useLang } from "../../_components/lang";
import { type ProductChoice, ProductSheet } from "../../_components/product-sheet";
import { type ApiError, fetchQuote, NetworkError, placeOrder } from "../../_lib/api";
import {
  addLine,
  type Cart,
  emptyCart,
  estimateMinor,
  itemCount,
  moveToTable,
  type PriceBook,
  randomKey,
  setCustomerNote,
  setQuantity,
  submissionKey,
  toOrderBody,
} from "../../_lib/cart";
import { loadCart, loadOrders, type PlacedOrder, rememberOrder, saveCart } from "../../_lib/storage";

// The customer ordering screen for one table (UI-001..004, ADR-013): menu, product options, cart and
// checkout. The table comes only from the QR token; prices come from the server.

const newLineId = () => randomKey(9);

function errorText(error: ApiError, status: number, t: Translate): string {
  switch (error.code) {
    case "SESSION_CLOSING":
      return t("error.sessionClosing");
    case "TABLE_INACTIVE":
      return t("error.tableInactive");
    case "TABLE_NOT_FOUND":
      return t("error.tableNotFound");
    default:
      return status === 429 ? t("error.rateLimited") : t("error.generic");
  }
}

export function OrderingApp({ qrToken, tableNumber, menu }: { qrToken: string; tableNumber: number; menu: PublicMenu }) {
  const { lang, t } = useLang();
  const router = useRouter();
  const [cart, setCart] = useState<Cart>(() => emptyCart(qrToken, tableNumber));
  const [loaded, setLoaded] = useState(false);
  const [foreign, setForeign] = useState<Cart | null>(null);
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [view, setView] = useState<"menu" | "cart">("menu");
  const [openProduct, setOpenProduct] = useState<PublicProduct | null>(null);
  const [quote, setQuote] = useState<QuoteState>({ status: "loading", quote: null });
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const submitting = useRef(false);

  const products = useMemo(() => new Map(menu.categories.flatMap((c) => c.products.map((p) => [p.id, p] as const))), [menu]);
  const prices: PriceBook = useMemo(
    () => new Map([...products.values()].map((p) => [p.id, { priceMinor: p.priceMinor, options: new Map(p.groups.flatMap((g) => g.options.map((o) => [o.id, o.priceDeltaMinor] as const))) }])),
    [products],
  );

  // Restore the cart after a refresh. A cart from another table is never used silently (SPEC §6.5).
  useEffect(() => {
    const stored = loadCart();
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser storage once after hydration */
    if (stored?.qrToken === qrToken) setCart({ ...stored, tableNumber });
    else if (stored && stored.lines.length > 0) setForeign(stored);
    setOrders(loadOrders(qrToken));
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [qrToken, tableNumber]);

  useEffect(() => {
    if (loaded && !foreign) saveCart(cart);
  }, [cart, loaded, foreign]);

  // Price the cart on the server whenever its contents change while the cart is open.
  const itemsKey = JSON.stringify(toOrderBody(cart).items);
  useEffect(() => {
    if (view !== "cart" || cart.lines.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setQuote((q) => ({ status: "loading", quote: q.quote }));
      try {
        const res = await fetchQuote({ qrToken, items: JSON.parse(itemsKey) });
        if (cancelled) return;
        if (res.ok) setQuote({ status: "ok", quote: res.data });
        else if (res.error.problems) setQuote({ status: "problems", quote: null, problems: res.error.problems });
        else setQuote({ status: "error", quote: null, message: errorText(res.error, res.status, t) });
      } catch {
        if (!cancelled) setQuote({ status: "error", quote: null, message: t("error.network") });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [view, itemsKey, qrToken, cart.lines.length, t]);

  const update = (next: Cart) => {
    setCart(next);
    if (submit.status !== "sending") setSubmit({ status: "idle" });
  };

  function add(choice: ProductChoice) {
    update(addLine(cart, choice, newLineId));
    setOpenProduct(null);
  }

  async function placeOrderNow() {
    if (submitting.current || quote.status !== "ok") return;
    submitting.current = true;
    setSubmit({ status: "sending" });
    const body = toOrderBody(cart, quote.quote.totals.totalMinor);
    const keyed = submissionKey(cart, body, () => randomKey());
    setCart(keyed.cart);
    saveCart(keyed.cart);
    try {
      const res = await placeOrder(body, keyed.key);
      if (res.ok) {
        rememberOrder({ qrToken, trackingToken: res.data.trackingToken, orderRef: res.data.orderRef, placedAt: new Date().toISOString() });
        const cleared = emptyCart(qrToken, tableNumber);
        setCart(cleared);
        saveCart(cleared);
        router.push(`/order/track/${res.data.trackingToken}`);
        return;
      }
      const { error } = res;
      if (error.code === "PRICES_CHANGED" && error.quote) {
        setQuote({ status: "ok", quote: error.quote });
        setSubmit({ status: "prices_changed" });
      } else if (error.problems) {
        setQuote({ status: "problems", quote: null, problems: error.problems });
        setSubmit({ status: "idle" });
      } else {
        setSubmit({ status: "error", message: errorText(error, res.status, t) });
      }
    } catch (e) {
      setSubmit({ status: "error", message: t(e instanceof NetworkError ? "error.network" : "error.generic") });
    } finally {
      submitting.current = false;
    }
  }

  const count = itemCount(cart);
  const restaurantName = pick(lang, menu.restaurant.nameAr, menu.restaurant.nameEn);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {menu.restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own media route
            <img src={menu.restaurant.logoUrl} alt="" className="size-12 rounded-full object-cover" />
          ) : null}
          <div className="flex flex-1 flex-col">
            <h1 className="text-xl font-bold leading-tight">{restaurantName}</h1>
            <p className="text-base font-semibold text-zinc-600" data-testid="table-number">
              {t("table.label", { number: tableNumber })}
            </p>
          </div>
          <LangSwitch />
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <AssistButton qrToken={qrToken} />
          {orders.length > 0 ? (
            <details className="text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center rounded-full border border-zinc-300 px-4 font-semibold">{t("orders.mine")}</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {orders.map((o) => (
                  <li key={o.trackingToken}>
                    <Link href={`/order/track/${o.trackingToken}`} className="text-emerald-700 underline" dir="ltr">
                      {o.orderRef}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </header>

      {foreign ? (
        <section role="alertdialog" aria-labelledby="foreign-title" className="flex flex-col gap-3 rounded-2xl border border-amber-400 bg-amber-50 p-4">
          <h2 id="foreign-title" className="font-bold">
            {t("cart.otherTable.title")}
          </h2>
          <p>
            {foreign.tableNumber === null
              ? t("cart.otherTable.body.unknown", { current: tableNumber })
              : t("cart.otherTable.body", { number: foreign.tableNumber, current: tableNumber })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setCart(moveToTable(foreign, qrToken, tableNumber));
                setForeign(null);
              }}
              className="min-h-11 rounded-xl bg-zinc-900 px-4 font-semibold text-white"
            >
              {t("cart.otherTable.keep")}
            </button>
            <button
              type="button"
              onClick={() => {
                setCart(emptyCart(qrToken, tableNumber));
                setForeign(null);
              }}
              className="min-h-11 rounded-xl border border-zinc-300 bg-white px-4 font-semibold"
            >
              {t("cart.otherTable.clear")}
            </button>
          </div>
        </section>
      ) : null}

      {view === "cart" ? (
        <CartView
          cart={cart}
          menu={menu}
          products={products}
          quote={quote}
          submit={submit}
          onQuantity={(id, q) => update(setQuantity(cart, id, q))}
          onNote={(note) => update(setCustomerNote(cart, note))}
          onBack={() => setView("menu")}
          onSubmit={placeOrderNow}
        />
      ) : (
        <MenuView menu={menu} onOpen={setOpenProduct} onQuickAdd={(p) => add({ productId: p.id, optionIds: [], quantity: 1, note: "" })} />
      )}

      {view === "menu" && count > 0 && !foreign ? (
        <div className="fixed inset-x-0 bottom-0 z-10 p-4">
          <button
            type="button"
            onClick={() => {
              setView("cart");
              window.scrollTo({ top: 0 });
            }}
            className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-between gap-3 rounded-2xl bg-zinc-900 px-5 text-white shadow-lg"
          >
            <span className="flex items-center gap-2 font-bold">
              {t("cart.open")}
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm tabular-nums" data-testid="cart-count">
                {count}
              </span>
            </span>
            <span className="font-semibold tabular-nums" title={t("cart.estimate")}>
              {money(lang, estimateMinor(cart, prices), menu.currency)}
            </span>
          </button>
        </div>
      ) : null}

      {openProduct ? <ProductSheet product={openProduct} currency={menu.currency} onAdd={add} onClose={() => setOpenProduct(null)} /> : null}
    </div>
  );
}

function MenuView({ menu, onOpen, onQuickAdd }: { menu: PublicMenu; onOpen: (p: PublicProduct) => void; onQuickAdd: (p: PublicProduct) => void }) {
  const { lang, t } = useLang();
  if (menu.categories.length === 0) return <p className="py-10 text-center text-zinc-500">{t("menu.empty")}</p>;
  return (
    <div className="flex flex-col gap-6 pb-28">
      <nav aria-label={t("menu.categories")} className="sticky top-0 z-10 -mx-4 overflow-x-auto bg-zinc-50/95 px-4 py-2 backdrop-blur">
        <ul className="flex gap-2">
          {menu.categories.map((c) => (
            <li key={c.id} className="shrink-0">
              <a href={`#cat-${c.id}`} className="flex min-h-11 items-center rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-100">
                {pick(lang, c.nameAr, c.nameEn)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {menu.categories.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} aria-labelledby={`cat-title-${c.id}`} className="scroll-mt-16">
          <h2 id={`cat-title-${c.id}`} className="mb-3 text-lg font-bold">
            {pick(lang, c.nameAr, c.nameEn)}
          </h2>
          <ul className="flex flex-col gap-3">
            {c.products.map((p) => {
              const name = pick(lang, p.nameAr, p.nameEn);
              const description = pick(lang, p.descriptionAr, p.descriptionEn);
              const hasChoices = p.groups.length > 0;
              return (
                <li key={p.id} className={`flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 ${p.isAvailable ? "" : "opacity-60"}`}>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served from our own media route
                    <img src={p.imageUrl} alt="" loading="lazy" className="size-24 shrink-0 rounded-xl object-cover" />
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <button type="button" onClick={() => onOpen(p)} disabled={!p.isAvailable} className="text-start text-base font-semibold">
                      {name}
                    </button>
                    {description ? <p className="line-clamp-2 text-sm text-zinc-600">{description}</p> : null}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span className="font-semibold tabular-nums">{money(lang, p.priceMinor, menu.currency)}</span>
                      {p.isAvailable ? (
                        <button
                          type="button"
                          onClick={() => (hasChoices ? onOpen(p) : onQuickAdd(p))}
                          aria-label={t("menu.addNamed", { name })}
                          className="min-h-11 rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800"
                        >
                          {hasChoices ? t("menu.choose") : t("menu.add")}
                        </button>
                      ) : (
                        <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-700">{t("menu.soldOut")}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
