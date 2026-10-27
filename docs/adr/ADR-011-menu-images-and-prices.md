# ADR-011 — Menu images and price entry (MENU-001)

**Status:** APPROVED 2026-10-27 by the Project Director under the user's delegation of technical decisions.

## Decision
- **Image storage:** product images are stored on the app server's disk under `UPLOAD_DIR` (default `./storage/uploads`, a persistent volume in deployment), behind a small storage module (`src/server/media/storage.ts`) so S3-compatible storage can replace it later without touching callers.
- **Upload validation (SPEC §22.7):** JPEG, PNG or WebP only, recognised by their file signature (magic bytes), never by file name or the browser's content type. Maximum 2 MB. SVG and every other type are refused. Files get a random UUID v7 name with an extension chosen by the server.
- **Serving:** `GET /api/media/{file}` serves only names matching that pattern, with the stored content type, `X-Content-Type-Options: nosniff`, and a one-year immutable cache (a new upload gets a new name). Images are public, like the menu.
- **Server Action body limit:** raised to 3 MB so a 2 MB image plus form fields fits.
- **Price entry:** staff type prices as decimal text (`45.50`). The server parses the text into integer minor units using the branch currency's number of decimal places from `Intl` (2 for EGP). It never goes through floating point (CLAUDE.md rule 5). In TypeScript, amounts are safe integers of minor units, matching the existing schema mapping. More decimal places than the currency allows are rejected, not rounded.
- **Deleting:** categories and products are deactivated, never deleted, because orders keep pointing at them (SPEC §5, §14.3). Inactive items are hidden from customers.
- **Audit:** creating or editing a category or product, every price change and every availability change is written to the audit log.

## Consequences
- Replaced images are not deleted yet; orphan cleanup is a later OPS task.
- Running several app instances needs shared storage (a shared volume or the S3 adapter).
