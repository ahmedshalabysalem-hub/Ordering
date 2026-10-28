# ADR-014 — Real-time updates (RT-001)

**Status:** APPROVED 2026-10-28 by the Project Director under the user's delegation of technical decisions. This ADR details the SSE + `LISTEN/NOTIFY` choice made in ADR-005.

## Context
SPEC §15 asks for screens to update without a refresh. It also requires:
- Scoped, authorized channels.
- No public access to unrestricted changes.
- Reconnection that reloads critical state.
- A polling fallback.
- The database stays the source of truth.

## Decision

### Events are thin notifications
- An event names what changed and nothing else:
  ```
  { type, branchId, orderId?, sessionId?, tableId? }
  ```
- Types: `order.created`, `order.updated`, `session.updated`, `assistance.updated`.
- Clients re-read the state through the normal authorized pages and APIs when an event arrives. An event never carries prices, names, notes or anything else a listener could not already read.

### Published inside the writing transaction
- Services call `publish(tx, event)`, which runs `pg_notify('ordering_events', json)` in the same transaction as the change.
- PostgreSQL delivers a notification only when the transaction commits, and drops it on rollback. That gives "after commit" delivery for free, with no outbox to maintain.
- Payloads are far below the 8000-byte limit.

### One listener per app process
- `src/server/realtime/hub.ts` keeps one dedicated `LISTEN` connection, using postgres.js `listen`, which reconnects and re-listens by itself.
- It fans events out in memory to subscribers.
- If the app is scaled to several instances, every instance listens, so nothing changes.

### Streams (Server-Sent Events)
- **`GET /api/staff/events`** is for signed-in staff with `orders.view_operational`.
  - It receives every event for the branch where the staff member holds that permission.
  - A stream lives at most 10 minutes. The browser then reconnects and is authorized again, so a disabled account loses access within minutes.
- **`GET /api/public/orders/{trackingToken}/events`** is for customers.
  - It is valid only for an existing tracking token.
  - It receives only `order.updated` for that one order, with no ids in the payload.
  - It allows at most 20 streams per order and 2000 public streams per process. Over the limit the answer is `429`, and the page falls back to polling.
- **SSE details:**
  - Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
  - The stream sends `retry: 5000` and a comment heartbeat every 25 seconds.
  - Every stream is closed and unsubscribed when the client disconnects.

### Client behaviour and fallback
- The client hook `useLiveRefresh(url)` opens an `EventSource`.
- **On each event and on every (re)connect,** it reloads the critical state:
  - Each event refreshes the page data.
  - Reconnecting does the same, because events sent while the client was disconnected were missed.
- **While connected,** it also refreshes every 60 seconds as a safety net.
- **When `EventSource` fails or is unavailable,** it polls every 15 seconds and keeps trying to reconnect.
- **When a tab is hidden,** both polling and refetching pause, and the state is reloaded when the tab becomes visible again.
- Losing the connection never affects writes. Orders keep their idempotency keys (ADR-012), so a disconnect cannot duplicate or lose an order.

## Consequences
- The app needs a long-running Node process (already required by ADR-005).
- Missed events are harmless, because every reconnect re-reads the state.
- OPS screens (cashier, kitchen) subscribe to `/api/staff/events` and refetch their data.
