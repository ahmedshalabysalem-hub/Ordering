"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads the order every few seconds while it can still change. RT-001 replaces this with SSE. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
