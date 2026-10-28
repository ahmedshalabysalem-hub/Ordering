"use client";

import { useLiveRefresh } from "@/app/_components/use-live-refresh";

/** Live updates for the order page while it can still change (RT-001), with a polling fallback. */
export function LiveOrder({ trackingToken }: { trackingToken: string }) {
  useLiveRefresh(`/api/public/orders/${trackingToken}/events`);
  return null;
}
