"use client";

import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/app/_components/use-live-refresh";

/** Subscribes the screen to the branch's live events (ADR-014) and shows a small connection badge. */
export function LiveStatus({ onEvent }: { onEvent?: (data: unknown) => void }) {
  const [now, setNow] = useState<string>("");
  useLiveRefresh("/api/staff/events", onEvent);
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
      <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
      Live · {now}
    </span>
  );
}

/** Minutes since `iso`, re-rendered by the parent's clock. */
export const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

/** A clock that ticks every 30 seconds, for elapsed times. */
export function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** A short two-tone chime made with Web Audio, so no sound file is needed. */
export function playChime() {
  try {
    const ctx = new AudioContext();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // Audio blocked or unsupported: the visual alert still shows.
  }
}
