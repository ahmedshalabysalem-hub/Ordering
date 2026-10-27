# ADR-006 — MVP business defaults (from DR-002)

**Status:** APPROVED 2026-10-27 under the user's explicit delegation.

Currency, timezone, tax and service charge are **admin settings**, not code constants. The values below are seed defaults only.

| Topic | Decision |
|---|---|
| Currency / timezone | Setting. Seed: EGP, Africa/Cairo. Any ISO 4217 currency and IANA timezone allowed (e.g. SAR, Asia/Riyadh). |
| Tax | Setting: one or more named tax rates (%), prices tax-inclusive or exclusive per setting. Seed: one rate "VAT" 14% exclusive. Must support Saudi VAT 15% by configuration; no compliance claim (spec §17.1). |
| Service charge | Setting, off by default. |
| Money | Integer minor units + currency code on every financial record. Rounding: half-up per order line, documented in code. |
| Order number | `YYYYMMDD-T{table}-{seq}`, sequence per table per business day, allocated atomically in the DB. |
| Table session | Multiple orders per open session; session closes only when every order is paid or cancelled and nothing is ready-but-undelivered. |
| Partial payments | Off in MVP. Data model keeps separate payment records so it can be enabled later. |
| Payment methods | Setting. Seed: Cash, Card (manual record only). |
| Captain login | None in MVP; cashier assigns captains. Schema supports a future captain login. |
| QR regeneration | Explicit audited admin action only (ADR-004); old token stops working immediately. |
