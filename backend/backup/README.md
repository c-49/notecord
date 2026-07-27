# NoteCord backups

Two independent backup mechanisms, both runnable via cron and by hand. Neither
depends on the other, and neither depends on NoteCord's own code being alive
to be useful.

| | Database backup (`backup-db.sh`) | Human-readable export (`export-notes.js`) |
|---|---|---|
| **What it is** | Raw `pg_dump` of the Postgres database | Full HTML/PDF/DOCX + JSON manifest of every section/page/note/attachment |
| **Reach for it when** | Restoring Directus to its exact prior state (the primary recovery path) | Reading your notes with zero Directus/Postgres/NoteCord dependency, or as a fallback source to rebuild content if the DB dump is ever unusable |
| **Restore with** | `pg_restore` | `restore-from-export.js` (reads only the JSON manifest — the fallback path) |

## Setup

### 1. Install rclone and configure the R2 remote

Both scripts require `rclone` on PATH — this is what copies backups off the
VM after every run, so a local disk failure or account suspension (the
incident that motivated this whole system) can't take your backups with it.

```bash
curl https://rclone.org/install.sh | sudo bash
rclone config
```

In the interactive config, create a new remote named exactly `r2`:
- Storage type: `s3` (Cloudflare R2 is S3-compatible)
- Provider: `Cloudflare`
- `access_key_id` / `secret_access_key`: from an R2 API token (Cloudflare dashboard → R2 → Manage API Tokens → Create Account API token → **Object Read & Write**, scoped to just this bucket rather than account-wide)
- `endpoint`: `https://<account-id>.r2.cloudflarestorage.com`

> **Gotcha:** if the API token is scoped to a single bucket (recommended — least privilege), rclone's default preflight bucket-existence check gets an `AccessDenied` on `CreateBucket`, since a bucket-scoped token can't list/create buckets at the account root. Add `no_check_bucket = true` to the `[r2]` remote's config (`~/.config/rclone/rclone.conf`) to skip that check — the bucket already exists, so nothing is lost by skipping it.

Verify with `rclone lsd r2:` — it should list your bucket(s) with no errors.

### 2. Environment variables

Add to `backend/.env` (see `.env.example`):

```
BACKUP_RETENTION_COUNT=14   # how many local dumps/export runs to keep before pruning
R2_BUCKET=your-bucket-name
R2_BACKUP_PREFIX=notecord   # path prefix inside the bucket
```

`DIRECTUS_URL`, `ADMIN_TOKEN`, and `ASSET_TOKEN` are reused as-is from the
existing `backend/.env` — no new Directus-side credentials needed.

### 3. Install export dependencies

```bash
cd backend/backup
npm install
```

`export-notes.js` uses Puppeteer (headless Chromium, for the PDF render) and
`html-to-docx` (for the DOCX render).

On a minimal Ubuntu server, Puppeteer's bundled Chromium needs these apt
packages. Ubuntu 24.04+ renamed several of these with a `t64` suffix (the
64-bit-time_t transition) — `libasound2`, `libatk-bridge2.0-0`, `libatk1.0-0`,
`libcups2`, and `libgtk-3-0` are now virtual/transitional packages with no
install candidate of their own, so use the `t64` names directly on anything
24.04 or newer (confirmed on 26.04):

```bash
sudo apt-get install -y \
  ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0t64 \
  libatk1.0-0t64 libcups2t64 libdrm2 libgbm1 libgtk-3-0t64 libnspr4 libnss3 \
  libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 xdg-utils
```

(On an older Ubuntu release without the `t64` transition, drop the suffix
back to the plain package names.)

## Running

Both are directly runnable with no flags:

```bash
./backup-db.sh
node export-notes.js
```

## Scheduling (crontab)

```cron
# NoteCord backups — edit with `crontab -e`
0  3 * * * cd /path/to/notecord/backend/backup && ./backup-db.sh    >> db/cron.log 2>&1
15 3 * * * cd /path/to/notecord/backend/backup && node export-notes.js >> export/cron.log 2>&1
* * * * *  cd /path/to/notecord/backend/backup && node export-personal.js >> export/personal-cron.log 2>&1
```

The nightly export is scheduled a few minutes after the DB dump so the two
don't compete for disk/CPU on the VM. `export-personal.js` runs every
minute but exits immediately (no Puppeteer launch) whenever there's nothing
pending, so idle cost is one cheap HTTP call — see "Personal exports" below.

## Personal exports (per-user, on-demand)

Every logged-in user (not just the admin) can request an export of *just
their own* notes from the app's Settings → Backups tab — this is a
different mechanism from the nightly whole-instance backup above:

- The click creates a row in `export_requests`, owner-stamped to that user.
- `export-personal.js` (cron, every minute) picks up pending rows, renders
  that one user's data via the same `lib/build-export.js` pipeline
  `export-notes.js` uses (just filtered to their `owner_id`), and uploads
  the result tagged with their `owner_id` on `directus_files` — so only
  that user can read it back (see the `directus_files:read` permission in
  `setup-schema.js`).
- Exactly one request is kept per user — a new one requested (or
  completed) prunes the previous request row and its uploaded files, so
  neither `export_requests` nor `directus_uploads` grows unbounded.
- These files are **not** synced to R2 and have no local-disk retention —
  they're a convenience feature, not part of the disaster-recovery backup
  system above. If a user needs their data back after real data loss, the
  nightly whole-instance export/DB dump is still the actual backup.

## Restoring

### From a DB dump (primary path)

```bash
# Against a fresh Postgres instance:
pg_restore -U directus -d notecord --clean --if-exists /path/to/notecord-db-<timestamp>.dump
```

This restores Directus to *exactly* its state at dump time, byte-for-byte.
This is always the first thing to try in a real disaster.

### From a human-readable export (fallback path)

```bash
node restore-from-export.js export/<run-timestamp>/ --confirm
```

- `--confirm` is required — this script creates data, so it refuses to run
  without it.
- It reads **only** `notecord-export.json` from the run folder — the
  `.html`/`.pdf`/`.docx` files are for humans and are never parsed back. The
  JSON manifest is the one reliable, round-trippable source of truth.
- It rebuilds sections → pages → notes → attachments in dependency order,
  re-uploading files and mapping old IDs to the new ones Directus assigns —
  **restored records get new auto-generated IDs**; relations between
  sections/pages/notes/attachments are preserved, but raw IDs from the
  original instance are not.
- Not idempotent — running it twice against the same Directus instance
  duplicates everything. It warns loudly if the target already has data, but
  only `--confirm` gates whether it writes at all.
- Not scheduled — this is a manual, deliberate action you take when actually
  restoring.

## Retention / rotation

Both scripts keep the last `BACKUP_RETENTION_COUNT` local artifacts (default
14 — dumps for the DB backup, run folders for the export) and delete older
ones after a successful run. This is **local-disk retention only** — R2
accumulates the full history of everything ever synced. If you want the
offsite copies pruned too, that's a job for an R2 lifecycle rule (Cloudflare
dashboard → R2 → bucket → Lifecycle rules), not this tooling.

## Known limitations

- **DOCX conversion**: `html-to-docx` renders images (converted to inline
  base64 for this pass only — the saved `.html`/`.pdf` still reference the
  `attachments/` folder on disk) and basic rich text (bold/italic/lists/
  headings/tables) faithfully. Voice-note and file-download links come
  through as plain hyperlinks without the button-like styling they get in
  the HTML/PDF.
- **Restored IDs**: as noted above, `restore-from-export.js` cannot
  reproduce the original instance's auto-increment/UUID values — only the
  content and its relationships.
- **Attachment availability**: if a file was already deleted from Directus
  (or fetching it fails) at export time, the export continues with a
  `[attachment unavailable: ...]` placeholder in its place rather than
  failing the whole run — check the warnings in `export/export.log` for
  anything that needs a closer look.
