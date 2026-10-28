import { sql } from "@/server/db/client";
import { CHANNEL, parseEvent, type RealtimeEvent } from "./events";

// In-process fan-out of database notifications (ADR-014). One LISTEN connection per app process;
// postgres.js reconnects and listens again by itself after a dropped connection.

type Listener = (event: RealtimeEvent) => void;

const globalForHub = globalThis as unknown as { realtimeHub?: { listeners: Set<Listener>; ready: Promise<unknown> | null } };
const hub = (globalForHub.realtimeHub ??= { listeners: new Set(), ready: null });

function ensureListening(): Promise<unknown> {
  hub.ready ??= sql
    .listen(CHANNEL, (payload) => {
      const event = parseEvent(payload);
      if (!event) return;
      for (const listener of hub.listeners) {
        try {
          listener(event);
        } catch {
          // One broken subscriber must not stop the others.
        }
      }
    })
    .catch((e) => {
      hub.ready = null;
      throw e;
    });
  return hub.ready;
}

/** Subscribes to every event; resolves once LISTEN is active. Returns the unsubscribe function. */
export async function subscribe(listener: Listener): Promise<() => void> {
  hub.listeners.add(listener);
  try {
    await ensureListening();
  } catch (e) {
    hub.listeners.delete(listener);
    throw e;
  }
  return () => hub.listeners.delete(listener);
}

export const subscriberCount = () => hub.listeners.size;
