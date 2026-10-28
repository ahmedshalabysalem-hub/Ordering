# Deployment and operations (DOC-002)

The app is a single Next.js process plus PostgreSQL 16. It serves:
- the pages
- the APIs
- the live SSE streams (ADR-014)

Uploaded images (menu photos, logo) live on disk in `UPLOAD_DIR`, so that folder must be persistent.

## 1. What you need
- A Linux server with Docker and Docker Compose. 1 vCPU and 1–2 GB RAM is enough for one restaurant.
- A domain name pointing at the server, for example `order.example.com`, and HTTPS. Phones open the QR links over the internet, and sign-in cookies are `Secure` on HTTPS.
- Outbound internet during the image build only, to download npm packages.

## 2. Environment variables
| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:password@host:5432/ordering`. The compose file builds it for you. |
| `BETTER_AUTH_SECRET` | yes | At least 32 random characters: `openssl rand -base64 32`. If it changes, every staff member is signed out. |
| `BETTER_AUTH_URL` | yes | The public URL, e.g. `https://order.example.com`. **Table QR codes print this URL.** Set it correctly before printing QR cards. |
| `UPLOAD_DIR` | no | Image folder. The default in Docker is `/app/storage/uploads`, which is a volume. |
| `PORT` | no | Default `3000`. |

`POSTGRES_PASSWORD` is used by `docker-compose.prod.yml` for the database container. Keep all of these in `.env.production` on the server. Never commit that file: `.env*` is git-ignored.

## 3. First deployment (Docker Compose)
```bash
git clone https://github.com/ahmedshalabysalem-hub/Ordering.git && cd Ordering
cat > .env.production <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://order.example.com
EOF
chmod 600 .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
curl -s http://127.0.0.1:3000/api/health          # {"status":"ok","db":"ok"}
```
- The app container applies database migrations every time it starts (`pnpm db:migrate`), then serves on `127.0.0.1:3000`.
- **Create the first administrator once** (SPEC §26). This command also creates the restaurant and branch with the defaults: EGP, Africa/Cairo, Arabic, VAT 14%, Cash and Card.
  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env.production exec app \
    pnpm --silent admin:bootstrap --email owner@example.com --name "Owner" \
    --restaurant-ar "اسم المطعم" --restaurant-en "Restaurant name"
  ```
  - It asks for the password with hidden input. You can also pass `-e BOOTSTRAP_ADMIN_PASSWORD=...` to `exec`.
  - It refuses to run again once an admin exists. Add more users from **Admin → Users & roles**.
- **Then sign in at `/login`:**
  1. Check **Admin → Settings**. The currency can only change before the first order.
  2. Add the menu.
  3. Create the tables.
  4. Print each table card from the table's page (**Print table card**).

This setup was verified on 2026-10-28:
- The image builds.
- The stack starts and migrations apply.
- The health check passes.
- The bootstrap creates an admin, and a second bootstrap is refused.
- An admin creates a table, a guest orders from its QR link, and the kitchen screen receives the order live.

## 4. HTTPS reverse proxy
Put a reverse proxy in front of the app. It must:
- terminate TLS
- forward `Host` and `X-Forwarded-*`
- **not buffer** the SSE streams (`/api/staff/events`, `/api/public/orders/*/events`)

The app already sends `X-Accel-Buffering: no`. Staff streams reconnect every 10 minutes by design. Proxy read timeouts of at least 60 s are fine, because the stream sends a heartbeat every 25 s.

Caddy (automatic HTTPS):
```
order.example.com {
  reverse_proxy 127.0.0.1:3000 {
    flush_interval -1
  }
}
```

nginx:
```
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
  proxy_read_timeout 120s;
  client_max_body_size 4m;   # image uploads up to 2 MB (ADR-011)
}
```

## 5. Updating
```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
Migrations run on start.
- **Take a backup first** (section 6).
- Only one app instance should run. Rate limits are kept in memory (ADR-009, ADR-012), and real-time events work across instances, but the rate limits do not.

## 6. Backups and recovery
Two things hold data: the **database** and the **uploads volume**. Back up both, daily, to storage off the server.

**Database backup** (consistent, while the app runs):
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_dump -U ordering -d ordering --format=custom > backup-$(date +%F).dump
```

**Images backup:**
```bash
docker run --rm -v ordering_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Keep at least 7 daily and 4 weekly copies, and test a restore every few months.

**Restore** (stops the app, replaces the data):
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production stop app
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_restore -U ordering -d ordering --clean --if-exists < backup-YYYY-MM-DD.dump
docker run --rm -v ordering_uploads:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/uploads-YYYY-MM-DD.tgz -C /data"
docker compose -f docker-compose.prod.yml --env-file .env.production start app
```

**Table QR tokens live in the database.** If you restore a backup, the QR cards printed from that data keep working. If you lose the database without a backup, every table card must be reprinted.

## 7. Running without Docker
Requirements: Node 22, pnpm 10, PostgreSQL 16.
```bash
pnpm install --frozen-lockfile
export DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://order.example.com UPLOAD_DIR=/var/lib/ordering/uploads
pnpm build
pnpm db:migrate
pnpm admin:bootstrap --email owner@example.com --name "Owner"   # once
pnpm start --port 3000                                          # keep running with systemd or pm2
```

## 8. Operations notes
- **Health:** `GET /api/health` returns `{"status":"ok","db":"ok"}`, or `503` when the database is unreachable. The Docker image has a `HEALTHCHECK` on it.
- **Time zone:** business days, order numbers and reports use the branch time zone from Settings, not the server's.
- **Forgotten password:** an admin sets a new one in **Users & roles**. If the only admin is locked out, wait 15 minutes for the lockout to end. If the password itself is lost, restore access with a direct database update by someone with server access. There is no public reset by design (ADR-009, ADR-017).
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f app`.
