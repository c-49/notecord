/**
 * NoteCord — nightly whole-instance human-readable export (HTML + PDF +
 * DOCX) plus a JSON manifest.
 *
 * Usage:
 *   node export-notes.js
 *
 * Reads DIRECTUS_URL / ADMIN_TOKEN / ASSET_TOKEN / BACKUP_RETENTION_COUNT /
 * R2_BUCKET / R2_BACKUP_PREFIX from backend/.env (same convention as
 * setup-schema.js). See README.md.
 *
 * Rendering itself (data fetch, HTML/PDF/DOCX build) lives in
 * lib/build-export.js, shared with export-personal.js (per-user, on-demand)
 * — this script just owns the nightly-specific parts: where files land on
 * disk, retention, R2 sync, and reporting to backup_status.
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { loadEnv } = require('./lib/env')
const { reportStatus } = require('./lib/report-status')
const { buildExport } = require('./lib/build-export')

const env = loadEnv()
const RETENTION = parseInt(env.BACKUP_RETENTION_COUNT ?? '14', 10)
const R2_BUCKET = env.R2_BUCKET
const R2_BACKUP_PREFIX = env.R2_BACKUP_PREFIX ?? 'notecord'

const BACKUP_DIR = __dirname
const EXPORT_ROOT = path.join(BACKUP_DIR, 'export')
const LOG_FILE = path.join(EXPORT_ROOT, 'export.log')

function logLine(status, detail) {
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  const ts = new Date().toISOString()
  fs.appendFileSync(LOG_FILE, `${ts} | ${status} | ${detail}\n`)
}

function fail(message) {
  console.error(`❌ ${message}`)
  logLine('FAILURE', message)
  process.exit(1)
}

// ── Retention + offsite sync ─────────────────────────────────────────────────

function applyRetention() {
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  const runDirs = fs.readdirSync(EXPORT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse() // newest first (ISO timestamps sort lexicographically)
  for (const old of runDirs.slice(RETENTION)) {
    console.log(`  ↳ removing old export run ${old}`)
    fs.rmSync(path.join(EXPORT_ROOT, old), { recursive: true, force: true })
  }
}

function rcloneAvailable() {
  const res = spawnSync('rclone', ['version'], { stdio: 'ignore' })
  return res.status === 0
}

function syncToR2(runDir, runId) {
  if (!rcloneAvailable()) {
    fail('rclone not found on PATH — offsite backup is required, not optional. See README.md to install/configure it.')
  }
  if (!R2_BUCKET) {
    fail('rclone is installed but R2_BUCKET is not set in backend/.env — see README.md')
  }
  const dest = `r2:${R2_BUCKET}/${R2_BACKUP_PREFIX}/export/${runId}/`
  console.log(`→ Syncing to ${dest}`)
  const res = spawnSync('rclone', ['copy', runDir, dest, '--create-empty-src-dirs'], { stdio: 'inherit' })
  if (res.status !== 0) {
    fail('rclone offsite sync failed — local export succeeded but is NOT yet copied offsite')
  }
  console.log('✓ Offsite copy complete')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now()

  console.log('\n→ Building export…')
  const runId = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '') + 'Z'
  const runDir = path.join(EXPORT_ROOT, runId)

  const { sections, pages, notes, warnings } = await buildExport({ outDir: runDir })
  console.log(`  ${sections.length} sections, ${pages.length} pages, ${notes.length} notes`)
  console.log(`✓ Wrote html/pdf/docx/json → ${runDir}`)

  applyRetention()
  syncToR2(runDir, runId)
  await reportStatus({
    type: 'export',
    detail: `${notes.length} notes, ${pages.length} pages`,
    files: {
      html: path.join(runDir, 'notecord-export.html'),
      pdf: path.join(runDir, 'notecord-export.pdf'),
      docx: path.join(runDir, 'notecord-export.docx'),
    },
  })

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
  const summary = `notes=${notes.length} pages=${pages.length} warnings=${warnings.length} duration=${durationSec}s run=${runId}`
  logLine('SUCCESS', summary)
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} warning(s):`)
    for (const w of warnings) console.log(`  - ${w}`)
  }
  console.log(`\n✅ Export complete in ${durationSec}s → ${runDir}`)
}

main().catch((e) => fail(e.message))
