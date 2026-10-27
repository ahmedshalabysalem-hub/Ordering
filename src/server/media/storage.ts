import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { v7 as uuidv7 } from "uuid";
import { env } from "@/server/env";
import { IMAGE_TYPES, type ImageExt, MEDIA_NAME, mediaUrl, validateImage } from "./images";

// Local-disk media storage (ADR-011). Callers use only these two functions, so an S3 adapter can
// replace this file later.

const uploadDir = () => path.resolve(env().UPLOAD_DIR);

/** Validates and stores an uploaded image; returns its public URL. */
export async function saveImage(bytes: Uint8Array): Promise<string> {
  const ext = validateImage(bytes);
  const name = `${uuidv7()}.${ext}`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), name), bytes, { flag: "wx" });
  return mediaUrl(name);
}

/** Reads a stored image by name, or null if the name is not one we issue or the file is missing. */
export async function readImage(name: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!MEDIA_NAME.test(name)) return null;
  try {
    const bytes = await readFile(path.join(uploadDir(), name));
    return { bytes, contentType: IMAGE_TYPES[name.split(".").pop() as ImageExt] };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
