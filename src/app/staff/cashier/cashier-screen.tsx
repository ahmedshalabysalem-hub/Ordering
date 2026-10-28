"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/server/money";
import type { BoardOrder, CashierBoard, CashierTable } from "@/server/operations/boards";
import type { TableColor } from "@/server/sessions/service";
import { assignCaptainAction, assistanceAction, cancelOrderAction, markDeliveredAction, sessionAction } from "../actions";
import { LiveStatus, minutesSince, playChime, useClock } from "../_components/live-status";
import { useStaffAction } from "../_components/use-staff-action";

// Cashier dashboard (OPS-001, OPS-003, OPS-004). The grid colors follow ADR-008 §6 and are derived on
// the server. Every action is re-checked on the server with the row's version.

const COLOR: Record<TableColor, { card: string; label: string }> = {
  available: { card: "border-zinc-300 bg-white", label: "Available" },
  new_order: { card: "border-orange-500 bg-orange-100 animate-pulse", label: "New order" },
  ready: { card: "border-emerald-600 bg-emerald-100", label: "Ready" },
  in_preparation: { card: "border-amber-500 bg-amber-50", label: "In preparation" },
  seated: { card: "border-yellow-400 bg-yellow-50", label: "Seated" },
};

const KITCHEN_LABEL: Record<string, string> = {
  NEW: "New",
  ACCEPTED: "Accepted",
  IN_PREPARATION: "In preparation",
  READY: "Ready",
  CANCELLED: "Cancelled",
};

export function CashierScreen({ board }: { board: CashierBoard }) {
  const now = useClock();
  const action = useStaffAction();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const money = (minor: number) => formatMoney(minor, board.currency);
  const selected = board.tables.find((t) => t.tableId === selectedId) ?? null;

  const alerts = board.tables.reduce((n, t) => n + t.orders.filter((o) => o.kitchenStatus === "NEW").length, 0) + board.assistance.filter((a) => a.status === "PENDING").length;
  const previous = useRef(alerts);
  useEffect(() => {
    if (sound && board.newOrderSound && alerts > previous.current) playChime();
    previous.current = alerts;
  }, [alerts, sound, board.newOrderSound]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Cashier</h1>
        <LiveStatus />
        <button
          type="button"
          onClick={() => {
            setSound((s) => !s);
            if (!sound) playChime();
          }}
          aria-pressed={sound}
          className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
        >
          {sound ? "🔔 Sound on" : "🔕 Sound off"}
        </button>
        <Link href="/staff" className="ms-auto text-sm underline">
          Staff home
        </Link>
      </header>

      <p role="status" aria-live="polite" className={action.result.error ? "rounded-lg bg-red-100 p-3 font-medium text-red-800" : action.result.ok ? "rounded-lg bg-emerald-100 p-3 font-medium text-emerald-800" : "sr-only"}>
        {action.result.error ?? action.result.ok}
      </p>

      {board.assistance.length > 0 ? (
        <section aria-labelledby="assist-title" className="flex flex-col gap-2 rounded-2xl border-2 border-red-400 bg-red-50 p-3">
          <h2 id="assist-title" className="font-bold text-red-800">
            🛎️ Assistance requests
          </h2>
          <ul className="flex flex-wrap gap-2">
            {board.assistance.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm" data-testid="assistance-request">
                <span className="font-bold">Table {a.tableNumber}</span>
                <span className="text-sm text-zinc-600">
                  {a.status === "PENDING" ? "waiting" : "on the way"} · {minutesSince(a.createdAt, now)} min
                </span>
                {a.status === "PENDING" ? (
                  <button type="button" disabled={action.pending} onClick={() => action.run(() => assistanceAction(a.id, "acknowledge"))} className="rounded-md bg-zinc-900 px-3 py-1 text-sm font-semibold text-white">
                    On my way
                  </button>
                ) : null}
                <button type="button" disabled={action.pending} onClick={() => action.run(() => assistanceAction(a.id, "resolve"))} className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-semibold">
                  Done
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_28rem]">
        <section aria-label="Tables">
          {board.tables.length === 0 ? <p className="text-zinc-500">No tables yet. Add them under Tables &amp; QR codes.</p> : null}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
            {board.tables.map((t) => (
              <li key={t.tableId}>
                <TableCard table={t} now={now} money={money} selected={t.tableId === selectedId} onSelect={() => setSelectedId(t.tableId === selectedId ? null : t.tableId)} />
              </li>
            ))}
          </ul>
        </section>
        {selected ? <TablePanel table={selected} board={board} now={now} money={money} action={action} onClose={() => setSelectedId(null)} /> : null}
      </div>
    </div>
  );
}

function TableCard({ table: t, now, money, selected, onSelect }: { table: CashierTable; now: number; money: (m: number) => string; selected: boolean; onSelect: () => void }) {
  const style = COLOR[t.color];
  const live = t.orders.filter((o) => o.kitchenStatus !== "CANCELLED");
  const due = live.reduce((sum, o) => sum + o.totalMinor - o.paidMinor, 0);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Table ${t.number}: ${style.label}`}
      data-testid={`table-card-${t.number}`}
      className={`flex h-full w-full flex-col items-start gap-1 rounded-2xl border-2 p-3 text-start shadow-sm ${style.card} ${selected ? "ring-4 ring-zinc-900" : ""} ${t.isActive ? "" : "opacity-50"}`}
    >
      <span className="flex w-full items-center justify-between">
        <span className="text-2xl font-black">{t.number}</span>
        {t.assistancePending ? <span title="Assistance requested">🛎️</span> : null}
      </span>
      <span className="text-sm font-bold" data-testid="table-status">
        {style.label}
        {t.session?.status === "CLOSING" ? " · closing" : ""}
      </span>
      {t.session ? (
        <>
          <span className="text-xs text-zinc-600">
            {live.length} order{live.length === 1 ? "" : "s"} · {t.openedAt ? `${minutesSince(t.openedAt, now)} min` : ""}
          </span>
          {t.awaitingPayment ? <span className="rounded bg-zinc-900 px-1.5 text-xs font-semibold text-white">Due {money(due)}</span> : null}
          {[...new Set(live.map((o) => o.captain?.name).filter(Boolean))].map((name) => (
            <span key={name} className="text-xs text-zinc-600">
              👤 {name}
            </span>
          ))}
        </>
      ) : null}
    </button>
  );
}

function TablePanel({
  table: t,
  board,
  now,
  money,
  action,
  onClose,
}: {
  table: CashierTable;
  board: CashierBoard;
  now: number;
  money: (m: number) => string;
  action: ReturnType<typeof useStaffAction>;
  onClose: () => void;
}) {
  const session = t.session;
  return (
    <aside aria-labelledby="panel-title" className="flex flex-col gap-3 self-start rounded-2xl bg-white p-4 shadow">
      <div className="flex items-center justify-between">
        <h2 id="panel-title" className="text-xl font-bold">
          Table {t.number}
          {t.name ? <span className="text-base font-normal text-zinc-500"> · {t.name}</span> : null}
        </h2>
        <button type="button" onClick={onClose} className="rounded-md px-2 text-2xl text-zinc-500" aria-label="Close table details">
          ×
        </button>
      </div>
      {!session ? <p className="text-zinc-500">No guests right now. The table is available.</p> : null}
      {t.orders.map((o) => (
        <OrderCard key={o.id} order={o} board={board} now={now} money={money} action={action} />
      ))}
      {session ? (
        <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
          {session.status === "OPEN" ? (
            <button type="button" disabled={action.pending} onClick={() => action.run(() => sessionAction(session.id, session.version, "start-closing"))} className="rounded-lg border border-zinc-300 px-3 py-2 font-semibold">
              Start closing
            </button>
          ) : (
            <button type="button" disabled={action.pending} onClick={() => action.run(() => sessionAction(session.id, session.version, "cancel-closing"))} className="rounded-lg border border-zinc-300 px-3 py-2 font-semibold">
              Reopen for orders
            </button>
          )}
          <button
            type="button"
            disabled={action.pending}
            onClick={() => {
              if (window.confirm(`Close table ${t.number}? The QR code stays the same for the next guests.`)) action.run(() => sessionAction(session.id, session.version, "close"));
            }}
            className="rounded-lg bg-zinc-900 px-3 py-2 font-semibold text-white"
          >
            Close table
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function OrderCard({ order: o, board, now, money, action }: { order: BoardOrder; board: CashierBoard; now: number; money: (m: number) => string; action: ReturnType<typeof useStaffAction> }) {
  const cancelled = o.kitchenStatus === "CANCELLED";
  return (
    <article className={`flex flex-col gap-2 rounded-xl border p-3 ${cancelled ? "border-zinc-200 bg-zinc-50 text-zinc-500" : "border-zinc-300"}`} data-testid="cashier-order">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold">{o.orderRef}</span>
        <span className="text-xs text-zinc-500">{minutesSince(o.createdAt, now)} min ago</span>
      </div>
      <div className="flex flex-wrap gap-1 text-xs font-semibold">
        <span className="rounded bg-zinc-200 px-2 py-0.5" data-testid="kitchen-status">
          {KITCHEN_LABEL[o.kitchenStatus] ?? o.kitchenStatus}
        </span>
        <span className="rounded bg-zinc-200 px-2 py-0.5">{o.deliveryStatus === "DELIVERED" ? "Served" : o.captain ? `Captain: ${o.captain.name}` : "Not assigned"}</span>
        <span className={`rounded px-2 py-0.5 ${o.paymentStatus === "PAID" ? "bg-emerald-200" : "bg-amber-200"}`} data-testid="payment-status">
          {o.paymentStatus.replace("_", " ").toLowerCase()}
        </span>
      </div>
      <ul className="text-sm">
        {o.items.map((item, i) => (
          <li key={i}>
            {item.quantity}× {item.name}
            {item.options.length ? <span className="text-zinc-500"> ({item.options.join(", ")})</span> : null}
            {item.note ? <span className="text-amber-700"> “{item.note}”</span> : null}
          </li>
        ))}
      </ul>
      {o.customerNote ? <p className="text-sm text-amber-800">Note: {o.customerNote}</p> : null}
      {cancelled && o.cancelReason ? <p className="text-sm">Cancelled: {o.cancelReason}</p> : null}
      <p className="text-right font-bold">
        {money(o.totalMinor)}
        {o.paidMinor > 0 ? <span className="text-sm font-normal text-zinc-500"> · paid {money(o.paidMinor)}</span> : null}
      </p>
      {cancelled ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {o.deliveryStatus !== "DELIVERED" ? (
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">Captain for {o.orderRef}</span>
              <select
                value={o.captain?.id ?? ""}
                disabled={action.pending || (board.captains.length === 0 && !o.captain)}
                onChange={(e) => action.run(() => assignCaptainAction(o.id, o.version, e.target.value || null))}
                className="rounded-md border border-zinc-300 px-2 py-1"
              >
                <option value="">{board.captains.length ? "No captain" : "No captains set up"}</option>
                {board.captains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {o.kitchenStatus === "READY" && o.deliveryStatus !== "DELIVERED" ? (
            <button type="button" disabled={action.pending} onClick={() => action.run(() => markDeliveredAction(o.id, o.version))} className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">
              Mark served
            </button>
          ) : null}
          <button
            type="button"
            disabled={action.pending}
            onClick={() => {
              const reason = window.prompt(`Why cancel ${o.orderRef}?`);
              if (reason) action.run(() => cancelOrderAction(o.id, o.version, reason));
            }}
            className="rounded-md border border-red-300 px-3 py-1 text-sm font-semibold text-red-700"
          >
            Cancel order
          </button>
        </div>
      )}
    </article>
  );
}
