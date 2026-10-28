"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type MessageKey, money, numberLocale, pick } from "@/i18n";
import { customerStatus, isFinal } from "@/server/customer/status";
import type { TrackedOrder } from "@/server/customer/tracking";
import { LangSwitch, useLang } from "../../_components/lang";
import { loadOrdersByToken } from "../../_lib/storage";

// The customer's order confirmation (SPEC §7.1). Payment is shown apart from the order status, and
// the page says plainly that it is not a payment receipt.

const STEPS = ["NEW", "ACCEPTED", "IN_PREPARATION", "READY", "DELIVERED"] as const;

export function TrackingView({ order, trackingToken }: { order: TrackedOrder; trackingToken: string }) {
  const { lang, t } = useLang();
  const [menuToken, setMenuToken] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage once after hydration
    setMenuToken(loadOrdersByToken(trackingToken)?.qrToken ?? null);
  }, [trackingToken]);

  const m = (minor: number) => money(lang, minor, order.currency);
  const status = customerStatus(order);
  const step = STEPS.indexOf(status as (typeof STEPS)[number]);
  const placedAt = new Intl.DateTimeFormat(numberLocale(lang), { dateStyle: "medium", timeStyle: "short", timeZone: order.timezone }).format(new Date(order.createdAt));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-600">{pick(lang, order.restaurant.nameAr, order.restaurant.nameEn)}</p>
          <h1 className="text-2xl font-bold">{t("track.title")}</h1>
        </div>
        <LangSwitch />
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <dt className="text-sm text-zinc-500">{t("track.ref")}</dt>
            <dd className="whitespace-nowrap font-mono text-xl font-bold">
              <span dir="ltr" className="inline-block" data-testid="order-ref">
                {order.orderRef}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">{t("track.table")}</dt>
            <dd className="text-lg font-bold">{order.tableNumber}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">{t("track.placedAt")}</dt>
            <dd>{placedAt}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="status-title" className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="status-title" className="font-semibold">
            {t("track.orderStatus")}
          </h2>
          <span
            data-testid="order-status"
            className={`rounded-full px-3 py-1 text-sm font-bold ${status === "CANCELLED" ? "bg-red-100 text-red-800" : status === "READY" || status === "DELIVERED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
          >
            {t(`status.${status}` as MessageKey)}
          </span>
        </div>
        {status === "CANCELLED" ? null : (
          <ol className="flex gap-1" aria-hidden>
            {STEPS.map((s, i) => (
              <li key={s} className={`h-2 flex-1 rounded-full ${i <= step ? "bg-emerald-500" : "bg-zinc-200"}`} />
            ))}
          </ol>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
          <span className="font-semibold">{t("track.paymentStatus")}</span>
          <span data-testid="payment-status" className="text-sm font-semibold text-zinc-700">
            {t(`payment.${order.paymentStatus}` as MessageKey)}
          </span>
        </div>
        {isFinal(order) ? null : <p className="text-xs text-zinc-500">{t("track.autoRefresh")}</p>}
      </section>

      <section aria-labelledby="items-title" className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 id="items-title" className="font-semibold">
          {t("track.items")}
        </h2>
        <ul className="flex flex-col divide-y divide-zinc-100">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <div className="flex flex-col">
                <span>
                  <span className="font-semibold tabular-nums">{item.quantity}×</span> {pick(lang, item.nameAr, item.nameEn)}
                </span>
                {item.options.map((o, j) => (
                  <span key={j} className="text-sm text-zinc-600">
                    {pick(lang, o.groupNameAr, o.groupNameEn)}: {pick(lang, o.nameAr, o.nameEn)}
                    {o.priceDeltaMinor > 0 ? ` (+${m(o.priceDeltaMinor)})` : ""}
                  </span>
                ))}
                {item.note ? <span className="text-sm text-zinc-500">“{item.note}”</span> : null}
              </div>
              <span className="tabular-nums">{m(item.lineTotalMinor)}</span>
            </li>
          ))}
        </ul>
        {order.customerNote ? (
          <p className="text-sm text-zinc-600">
            {t("track.note")}: {order.customerNote}
          </p>
        ) : null}
        <dl className="flex flex-col gap-1 border-t border-zinc-200 pt-2">
          <Row label={t("cart.subtotal")} value={m(order.subtotalMinor)} />
          {order.discountMinor > 0 ? <Row label={t("cart.discount")} value={`−${m(order.discountMinor)}`} /> : null}
          {order.taxMinor > 0 ? <Row label={t("cart.tax")} value={m(order.taxMinor)} /> : null}
          {order.serviceMinor > 0 ? <Row label={t("cart.service")} value={m(order.serviceMinor)} /> : null}
          <Row label={t("cart.total")} value={m(order.totalMinor)} strong testId="order-total" />
          {order.paidMinor > 0 ? <Row label={t("track.paid")} value={m(order.paidMinor)} /> : null}
        </dl>
      </section>

      <p className="rounded-xl bg-zinc-100 p-3 text-center text-sm text-zinc-700">{t("track.notReceipt")}</p>

      {menuToken ? (
        <Link href={`/order/table/${menuToken}`} className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 bg-white font-semibold hover:bg-zinc-100">
          {t("track.backToMenu")}
        </Link>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-lg font-bold" : "text-zinc-700"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
