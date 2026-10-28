"use client";

import { useEffect, useRef, useState } from "react";
import { callAssistance, NetworkError } from "../_lib/api";
import { useLang } from "./lang";

// "طلب مساعدة / Request Assistance" (SPEC §6.6). Disabled while a call is in flight; the server
// deduplicates and applies the cooldown (ADR-013).

type Note = { kind: "ok" | "error"; text: string } | null;

export function AssistButton({ qrToken }: { qrToken: string }) {
  const { t } = useLang();
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function call() {
    if (sending) return;
    setSending(true);
    let next: Note;
    try {
      const res = await callAssistance(qrToken);
      if (res.ok) next = { kind: "ok", text: t(res.data.deduplicated ? "assist.already" : "assist.sent") };
      else if (res.error.code === "ASSISTANCE_COOLDOWN") next = { kind: "ok", text: t("assist.cooldown", { seconds: res.error.retryAfterSeconds ?? 60 }) };
      else if (res.error.code === "TABLE_INACTIVE") next = { kind: "error", text: t("error.tableInactive") };
      else if (res.status === 429) next = { kind: "error", text: t("error.rateLimited") };
      else next = { kind: "error", text: t("error.generic") };
    } catch (e) {
      next = { kind: "error", text: t(e instanceof NetworkError ? "error.network" : "error.generic") };
    }
    setSending(false);
    setNote(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 8000);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={call}
        disabled={sending}
        className="min-h-11 rounded-full bg-amber-500 px-4 text-sm font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 disabled:opacity-60"
      >
        🛎️ {sending ? t("assist.sending") : t("assist.button")}
      </button>
      <p role="status" aria-live="polite" className={note ? `text-sm ${note.kind === "ok" ? "text-emerald-700" : "text-red-700"}` : "sr-only"}>
        {note?.text}
      </p>
    </div>
  );
}
