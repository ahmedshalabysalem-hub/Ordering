"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BoardOrder, KitchenBoard } from "@/server/operations/boards";
import { kitchenMove, productAvailabilityAction } from "../actions";
import { LiveStatus, minutesSince, playChime, useClock } from "../_components/live-status";
import { useStaffAction } from "../_components/use-staff-action";

// Kitchen display (OPS-002). Three columns, oldest first; age turns amber and red at the branch's
// warning and overdue minutes. Every move is checked on the server with the order's version. A ticket
// leaves NEW only with a responsible chef picked from the admin's list (ADR-018).

const COLUMNS = [
  { title: "New", statuses: ["NEW", "ACCEPTED"] },
  { title: "In preparation", statuses: ["IN_PREPARATION"] },
  { title: "Ready to serve", statuses: ["READY"] },
] as const;

export function KitchenScreen({ board }: { board: KitchenBoard }) {
  const now = useClock();
  const action = useStaffAction();
  const [sound, setSound] = useState(false);
  const newCount = board.tickets.filter((t) => t.kitchenStatus === "NEW").length;
  const previous = useRef(newCount);

  useEffect(() => {
    if (sound && newCount > previous.current) playChime();
    previous.current = newCount;
  }, [newCount, sound]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Kitchen</h1>
        <LiveStatus />
        <button
          type="button"
          onClick={() => {
            setSound((s) => !s);
            if (!sound) playChime();
          }}
          aria-pressed={sound}
          className="rounded-full border border-zinc-600 px-4 py-2 text-sm font-semibold"
        >
          {sound ? "🔔 Sound on" : "🔕 Sound off"}
        </button>
        <Link href="/staff" className="ms-auto text-sm text-zinc-400 underline">
          Staff home
        </Link>
      </header>
      <p role="status" className={action.result.error ? "text-lg font-semibold text-red-400" : "sr-only"}>
        {action.result.error ?? action.result.ok}
      </p>

      <div className="grid flex-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const tickets = board.tickets.filter((t) => (col.statuses as readonly string[]).includes(t.kitchenStatus));
          return (
            <section key={col.title} aria-labelledby={`col-${col.title}`} className="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-3">
              <h2 id={`col-${col.title}`} className="text-xl font-bold">
                {col.title} <span className="text-zinc-400">({tickets.length})</span>
              </h2>
              {tickets.length === 0 ? <p className="text-zinc-500">Nothing here.</p> : null}
              {tickets.map((t) => (
                <Ticket key={t.id} ticket={t} chefs={board.chefs} age={minutesSince(t.createdAt, now)} warn={board.warnMinutes} overdue={board.overdueMinutes} action={action} />
              ))}
            </section>
          );
        })}
      </div>

      <details className="rounded-2xl bg-zinc-900 p-3">
        <summary className="cursor-pointer text-lg font-semibold">Sold out switches</summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {board.products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-800 px-3 py-2">
              <span>
                {p.name} <span className="text-xs text-zinc-400">· {p.category}</span>
              </span>
              <button
                type="button"
                disabled={action.pending}
                onClick={() => action.run(() => productAvailabilityAction(p.id, !p.isAvailable))}
                className={`rounded-md px-3 py-1 text-sm font-semibold ${p.isAvailable ? "bg-emerald-700" : "bg-red-700"}`}
                aria-label={`${p.name}: ${p.isAvailable ? "available, mark sold out" : "sold out, mark available"}`}
              >
                {p.isAvailable ? "Available" : "Sold out"}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Ticket({
  ticket: t,
  chefs,
  age,
  warn,
  overdue,
  action,
}: {
  ticket: BoardOrder;
  chefs: KitchenBoard["chefs"];
  age: number;
  warn: number;
  overdue: number;
  action: ReturnType<typeof useStaffAction>;
}) {
  const ageClass = t.kitchenStatus === "READY" ? "text-zinc-300" : age >= overdue ? "bg-red-600 text-white" : age >= warn ? "bg-amber-500 text-zinc-950" : "text-zinc-300";
  const button = "min-h-14 flex-1 rounded-xl px-4 text-lg font-bold disabled:opacity-50";
  const picking = t.kitchenStatus === "NEW" || t.kitchenStatus === "ACCEPTED";
  const [picked, setPicked] = useState("");
  // Falls back to the order's chef, which another screen may have set since this one loaded.
  const chefId = picked || t.chef?.id || "";
  // The chef goes with the move only when it is new or changed; the server checks it is active.
  const chosen = chefId && chefId !== t.chef?.id ? chefId : null;
  const noChef = !chefId;
  return (
    <article
      aria-label={`Table ${t.tableNumber}, order ${t.orderRef}`}
      data-testid="kitchen-ticket"
      className={`flex flex-col gap-3 rounded-xl border-2 bg-zinc-800 p-4 ${t.kitchenStatus === "NEW" ? "border-amber-400" : "border-zinc-700"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-3xl font-black">Table {t.tableNumber}</p>
          <p className="font-mono text-sm text-zinc-400">{t.orderRef}</p>
        </div>
        <span className={`rounded-lg px-2 py-1 text-xl font-bold tabular-nums ${ageClass}`}>{age} min</span>
      </div>
      <ul className="flex flex-col gap-2 text-xl">
        {t.items.map((item, i) => (
          <li key={i}>
            <span className="font-black">{item.quantity}×</span> {item.name}
            {item.options.map((o) => (
              <span key={o} className="block ps-8 text-base text-zinc-300">
                {o}
              </span>
            ))}
            {item.note ? <span className="block ps-8 text-base font-semibold text-amber-300">“{item.note}”</span> : null}
          </li>
        ))}
      </ul>
      {t.customerNote ? <p className="rounded-lg bg-amber-900/50 p-2 text-amber-200">Note: {t.customerNote}</p> : null}
      {t.captain ? <p className="text-sm text-zinc-400">Captain: {t.captain.name}</p> : null}
      {picking ? (
        <label className="flex flex-col gap-1 text-base font-semibold">
          Chef responsible
          <select
            value={chefId}
            onChange={(e) => setPicked(e.target.value)}
            disabled={action.pending || chefs.length === 0}
            className="min-h-12 rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-lg"
          >
            <option value="">{chefs.length ? "Choose a chef" : "No chefs set up"}</option>
            {t.chef && !chefs.some((c) => c.id === t.chef!.id) ? <option value={t.chef.id}>{t.chef.name}</option> : null}
            {chefs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {chefs.length === 0 ? <span className="text-sm font-normal text-amber-300">Ask an admin to add chefs under Admin → Chefs.</span> : null}
        </label>
      ) : t.chef ? (
        <p className="text-base font-semibold text-zinc-200">Chef: {t.chef.name}</p>
      ) : null}
      <div className="flex gap-2">
        {t.kitchenStatus === "NEW" ? (
          <button type="button" disabled={action.pending || noChef} onClick={() => action.run(() => kitchenMove(t.id, t.version, "ACCEPTED", chosen))} className={`${button} bg-zinc-600`}>
            Accept
          </button>
        ) : null}
        {t.kitchenStatus === "NEW" || t.kitchenStatus === "ACCEPTED" ? (
          <button type="button" disabled={action.pending || noChef} onClick={() => action.run(() => kitchenMove(t.id, t.version, "IN_PREPARATION", chosen))} className={`${button} bg-amber-500 text-zinc-950`}>
            Start preparing
          </button>
        ) : null}
        {t.kitchenStatus === "IN_PREPARATION" ? (
          <button type="button" disabled={action.pending} onClick={() => action.run(() => kitchenMove(t.id, t.version, "READY"))} className={`${button} bg-emerald-600`}>
            Ready
          </button>
        ) : null}
        {t.kitchenStatus === "ACCEPTED" ? <span className="self-center text-sm text-zinc-400">Accepted</span> : null}
      </div>
    </article>
  );
}
