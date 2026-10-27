// Image validation for uploads (ADR-011). Pure: no file system or database access.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const IMAGE_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type ImageExt = keyof typeof IMAGE_TYPES;

export class ImageError extends Error {}

/** Identifies JPEG, PNG or WebP from the file signature. Returns null for anything else. */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

/** Checks size and type; returns the extension the server will use. */
export function validateImage(bytes: Uint8Array): ImageExt {
  if (bytes.byteLength === 0) throw new ImageError("The image file is empty.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ImageError("Images must be 2 MB or smaller.");
  const ext = sniffImage(bytes);
  if (!ext) throw new ImageError("Upload a JPEG, PNG or WebP image.");
  return ext;
}

/** Stored file names: a UUID plus an extension the server chose. Anything else is never served. */
export const MEDIA_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const mediaUrl = (name: string) => `/api/media/${name}`;
