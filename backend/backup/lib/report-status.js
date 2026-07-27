/**
 * Shared "backup_status" reporter — called by both backup-db.sh (as a CLI
 * subprocess) and export-notes.js (as a direct require) after a successful
 * run. Never throws: this is cosmetic status reporting for the frontend's
 * admin-only "Last backup" indicator/downloads, and must never turn an
 * already-successful backup into a reported failure.
 *
 * Uploaded files are tagged into the "Backups" Directus folder (created by
 * setup-schema.js, and self-healed here if missing) — that folder tag is
 * what the "Backup Admin" policy's directus_files:read permission filters
 * on, so only the one admin user (not every app user) can fetch them.
 */
const fs = require('fs')
const path = require('path')
const { loadEnv } = require('./env')

const env = loadEnv()
const BASE = env.DIRECTUS_URL ?? 'http://localhost:8055'
const TOKEN = env.ADMIN_TOKEN

async function req(method, urlPath, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json.errors?.[0]?.message ?? JSON.stringify(json)
    throw new Error(`${method} ${urlPath} → ${res.status}: ${msg}`)
  }
  return json.data ?? json
}

async function getOrCreateBackupsFolderId() {
  const existing = await req('GET', `/folders?filter[name][_eq]=Backups&limit=1`)
  const row = (existing.data ?? existing)[0]
  if (row) return row.id
  const created = await req('POST', '/folders', { name: 'Backups' })
  return created.id
}

async function uploadFile(localPath, filename, folderId) {
  const buf = fs.readFileSync(localPath)
  const form = new FormData()
  if (folderId) form.append('folder', folderId)
  form.append('file', new Blob([buf]), filename)
  const res = await fetch(`${BASE}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json.errors?.[0]?.message ?? JSON.stringify(json)
    throw new Error(`POST /files → ${res.status}: ${msg}`)
  }
  return json.data.id
}

/**
 * @param {{ type: string, detail: string, files: Record<string, string> }} opts
 *   files maps a format name (e.g. "dump", "pdf") to a local file path.
 */
async function reportStatus({ type, detail, files }) {
  try {
    const folderId = await getOrCreateBackupsFolderId()

    const existingResp = await req('GET', `/items/backup_status?filter[type][_eq]=${type}&limit=1&fields=id,files`)
    const existing = (existingResp.data ?? existingResp)[0]
    const oldFiles = existing?.files ?? {}

    const newFiles = {}
    for (const [formatName, localPath] of Object.entries(files)) {
      const filename = `notecord-${type}-${formatName}${path.extname(localPath)}`
      newFiles[formatName] = await uploadFile(localPath, filename, folderId)
    }

    const body = { type, last_success_at: new Date().toISOString(), detail, files: newFiles }
    if (existing) {
      await req('PATCH', `/items/backup_status/${existing.id}`, body)
    } else {
      await req('POST', '/items/backup_status', body)
    }

    // Best-effort cleanup of the previous run's files — keeps directus_uploads
    // from growing every night; backup_status only ever points at the latest copy.
    for (const [formatName, oldId] of Object.entries(oldFiles)) {
      if (oldId && oldId !== newFiles[formatName]) {
        await req('DELETE', `/files/${oldId}`).catch(() => {})
      }
    }
  } catch (e) {
    console.log(`  ↳ (non-fatal) failed to report backup_status: ${e.message}`)
  }
}

module.exports = { reportStatus }

// ── CLI entrypoint (for backup-db.sh) ────────────────────────────────────────
// Usage: node report-status.js <type> <detail> <formatName>=<localPath> ...
if (require.main === module) {
  const [type, detail, ...fileArgs] = process.argv.slice(2)
  const files = Object.fromEntries(fileArgs.map((arg) => arg.split('=')))
  reportStatus({ type, detail, files }).catch((e) => {
    console.log(`  ↳ (non-fatal) report-status.js failed: ${e.message}`)
  })
}
