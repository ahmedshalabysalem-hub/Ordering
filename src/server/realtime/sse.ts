import { subscribe } from "./hub";
import type { RealtimeEvent } from "./events";

// Server-Sent Events response for a filtered slice of the event stream (ADR-014).

const HEARTBEAT_MS = 25_000;

export type StreamOptions = {
  signal: AbortSignal;
  /** Returns the data to send for an event, or null to skip it. */
  select: (event: RealtimeEvent) => object | null;
  /** Closes the stream after this long so the client reconnects and is authorized again. */
  maxAgeMs?: number;
  onClose?: () => void;
};

export async function eventStream({ signal, select, maxAgeMs, onClose }: StreamOptions): Promise<Response> {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const unsubscribe = await subscribe((event) => {
        const data = select(event);
        if (data) send(`data: ${JSON.stringify(data)}\n\n`);
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      const maxAge = maxAgeMs ? setTimeout(() => cleanup(), maxAgeMs) : undefined;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(maxAge);
        unsubscribe();
        onClose?.();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };
      signal.addEventListener("abort", () => cleanup());
      if (signal.aborted) cleanup();
      send("retry: 5000\n: connected\n\n");
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
