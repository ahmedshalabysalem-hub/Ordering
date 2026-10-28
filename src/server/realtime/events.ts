import { sql } from "drizzle-orm";

// Real-time notifications (RT-001, ADR-014). Events only say what changed; listeners re-read the state
// through their normal authorized paths. Publishing runs pg_notify inside the writing transaction, so
// PostgreSQL delivers the event only if that transaction commits.

export const CHANNEL = "ordering_events";

export type RealtimeEvent = {
  type: "order.created" | "order.updated" | "session.updated" | "assistance.updated";
  branchId: string;
  orderId?: string;
  sessionId?: string;
  tableId?: string;
};

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

export async function publish(tx: Executor, event: RealtimeEvent): Promise<void> {
  await tx.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(event)})`);
}

export function parseEvent(payload: string): RealtimeEvent | null {
  try {
    const e = JSON.parse(payload) as RealtimeEvent;
    return typeof e?.type === "string" && typeof e.branchId === "string" ? e : null;
  } catch {
    return null;
  }
}
