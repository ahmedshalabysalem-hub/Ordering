import { readImage } from "@/server/media/storage";

// Public menu images (ADR-011). Names are random and never reused, so responses cache for a year.
export async function GET(_req: Request, ctx: RouteContext<"/api/media/[name]">) {
  const { name } = await ctx.params;
  const image = await readImage(name);
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
