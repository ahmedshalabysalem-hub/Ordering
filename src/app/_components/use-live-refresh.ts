"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Keeps a server-rendered page current (RT-001, ADR-014). Each event from the stream, and every
// (re)connect, re-reads the page: events missed while disconnected are covered by that re-read. While
// the stream is down, it polls instead. Nothing happens while the tab is hidden.

const SAFETY_REFRESH_MS = 60_000;
const POLL_MS = 15_000;

export function useLiveRefresh(url: string | null, onEvent?: (data: unknown) => void) {
  const router = useRouter();
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!url) return;
    let source: EventSource | null = null;
    let connected = false;
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      router.refresh();
    };

    if (typeof EventSource !== "undefined") {
      source = new EventSource(url);
      source.onopen = () => {
        connected = true;
        refresh();
      };
      source.onmessage = (message) => {
        let data: unknown = null;
        try {
          data = JSON.parse(message.data);
        } catch {
          // Not JSON: still a change notice.
        }
        handler.current?.(data);
        refresh();
      };
      // EventSource retries by itself; meanwhile the timer below polls.
      source.onerror = () => {
        connected = false;
      };
    }

    const timer = setInterval(() => {
      if (Date.now() - last >= (connected ? SAFETY_REFRESH_MS : POLL_MS)) refresh();
    }, 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      source?.close();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, router]);
}
