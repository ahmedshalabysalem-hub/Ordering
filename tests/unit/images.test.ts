import { describe, expect, it } from "vitest";
import { ImageError, MAX_IMAGE_BYTES, MEDIA_NAME, sniffImage, validateImage } from "@/server/media/images";

const bytes = (...head: number[]) => new Uint8Array([...head, ...new Array(32).fill(0)]);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);

describe("image upload validation (ADR-011)", () => {
  it("recognises JPEG, PNG and WebP by their signature", () => {
    expect(sniffImage(JPEG)).toBe("jpg");
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(WEBP)).toBe("webp");
  });

  it("refuses SVG, HTML, GIF and empty or oversized files", () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(() => validateImage(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toThrow(ImageError);
    expect(() => validateImage(text("<html><body>hi</body></html>"))).toThrow(ImageError);
    expect(() => validateImage(text("GIF89a......"))).toThrow(ImageError);
    expect(() => validateImage(new Uint8Array())).toThrow("empty");
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect(() => validateImage(big)).toThrow("2 MB");
  });

  it("only serves names the server issued", () => {
    expect(MEDIA_NAME.test("0190f3a2-7b1c-7def-8a9b-0123456789ab.png")).toBe(true);
    for (const bad of ["../secret.png", "x.png", "0190f3a2-7b1c-7def-8a9b-0123456789ab.svg", "0190f3a2-7b1c-7def-8a9b-0123456789ab.png/../a"]) {
      expect(MEDIA_NAME.test(bad), bad).toBe(false);
    }
  });
});
