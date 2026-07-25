/**
 * NoteCord — restore content from a human-readable export run folder.
 *
 * This is the FALLBACK recovery path — the primary path is restoring the
 * pg_dump from backup-db.sh via pg_restore (see README.md). Use this only
 * when the DB dump is missing/corrupt, or you're rebuilding into a fresh
 * Directus instance and just want the content back.
 *
 * Usage:
 *   node restore-from-export.js <path-to-export-run-folder> --confirm
 *
 * Reads DIRECTUS_URL / ADMIN_TOKEN from backend/.env.
 */

const fs = require('fs')
const path = require('path')
const { loadEnv } = require('./lib/env')

const env = loadEnv()
const BASE = env.DIRECTUS_URL ?? 'http://localhost:8055'
const TOKEN = env.ADMIN_TOKEN

const LOG_FILE = path.join(__dirname, 'export', 'restore.log')

function log(line) {
  console.log(line)
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} | ${line}\n`)
}

function fail(message) {
  console.error(`❌ ${message}`)
  log(`FAILURE | ${message}`)
  process.exit(1)
}

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

async function uploadFile(localPath, filename) {
  const buf = fs.readFileSync(localPath)
  const form = new FormData()
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

async function collectionCount(collection) {
  const data = await req('GET', `/items/${collection}?aggregate[count]=*`)
  return parseInt(data?.[0]?.count ?? '0', 10)
}

async function main() {
  const args = process.argv.slice(2)
  const confirm = args.includes('--confirm')
  const runDirArg = args.find((a) => !a.startsWith('--'))

  if (!runDirArg) fail('Usage: node restore-from-export.js <path-to-export-run-folder> --confirm')
  if (!TOKEN) fail('ADMIN_TOKEN is not set in backend/.env')

  const runDir = path.resolve(runDirArg)
  const manifestPath = path.join(runDir, 'notecord-export.json')
  if (!fs.existsSync(manifestPath)) fail(`No notecord-export.json found in ${runDir}`)

  if (!confirm) {
    fail('Refusing to run without --confirm — this creates data in the target Directus instance. Re-run with --confirm once you\'re sure.')
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const attachmentsDir = path.join(runDir, 'attachments')

  console.log(`\nRestoring into Directus at ${BASE}…`)
  await req('GET', '/server/health').catch(() => fail('Cannot reach Directus.'))
  console.log('✓ Directus is reachable')

  for (const collection of ['sections', 'pages', 'notes']) {
    const count = await collectionCount(collection)
    if (count > 0) {
      console.log(`⚠ Target collection "${collection}" already has ${count} record(s) — this restore is not idempotent and will duplicate content if run twice. Proceeding because --confirm was passed.`)
    }
  }

  const summary = { sections: 0, pages: 0, notes: 0, note_files: 0, files: 0, skipped: 0 }

  // 1. Upload files, building old file_id -> new file_id map
  console.log(`\n→ Uploading ${Object.keys(manifest.attachments ?? {}).length} attachment(s)…`)
  const fileIdMap = {}
  const filesById = Object.fromEntries((manifest.directus_files ?? []).map((f) => [f.id, f]))
  for (const [oldFileId, localFilename] of Object.entries(manifest.attachments ?? {})) {
    const localPath = path.join(attachmentsDir, localFilename)
    if (!fs.existsSync(localPath)) {
      console.log(`  ↳ skipping ${oldFileId}: local file ${localFilename} missing`)
      summary.skipped++
      continue
    }
    try {
      const downloadName = filesById[oldFileId]?.filename_download ?? localFilename
      const newId = await uploadFile(localPath, downloadName)
      fileIdMap[oldFileId] = newId
      summary.files++
    } catch (e) {
      console.log(`  ↳ skipping ${oldFileId}: ${e.message}`)
      summary.skipped++
    }
  }
  console.log(`✓ Uploaded ${summary.files} file(s)`)

  // 2. Sections
  console.log(`\n→ Creating ${(manifest.sections ?? []).length} section(s)…`)
  const sectionIdMap = {}
  for (const s of manifest.sections ?? []) {
    const created = await req('POST', '/items/sections', { name: s.name, emoji: s.emoji, sort_order: s.sort_order })
    sectionIdMap[s.id] = created.id
    summary.sections++
  }

  // 3. Pages
  console.log(`→ Creating ${(manifest.pages ?? []).length} page(s)…`)
  const pageIdMap = {}
  for (const p of manifest.pages ?? []) {
    const created = await req('POST', '/items/pages', {
      name: p.name,
      emoji: p.emoji,
      section_id: p.section_id ? sectionIdMap[p.section_id] ?? null : null,
      sort_order: p.sort_order,
    })
    pageIdMap[p.id] = created.id
    summary.pages++
  }

  // 4. Notes
  console.log(`→ Creating ${(manifest.notes ?? []).length} note(s)…`)
  const noteIdMap = {}
  for (const n of manifest.notes ?? []) {
    const targetPageId = pageIdMap[n.page_id]
    if (!targetPageId) {
      console.log(`  ↳ skipping note ${n.id}: parent page ${n.page_id} was not restored`)
      summary.skipped++
      continue
    }
    const created = await req('POST', '/items/notes', { page_id: targetPageId, content: n.content })
    noteIdMap[n.id] = created.id
    summary.notes++
  }

  // 5. note_files
  console.log(`→ Creating ${(manifest.note_files ?? []).length} attachment link(s)…`)
  for (const nf of manifest.note_files ?? []) {
    const targetNoteId = noteIdMap[nf.note_id]
    if (!targetNoteId) {
      console.log(`  ↳ skipping note_files ${nf.id}: parent note ${nf.note_id} was not restored`)
      summary.skipped++
      continue
    }
    const targetFileId = nf.file_id ? fileIdMap[nf.file_id] ?? null : null
    await req('POST', '/items/note_files', {
      note_id: targetNoteId,
      file_id: targetFileId,
      attachment_type: nf.attachment_type,
      embed_url: nf.embed_url,
      sort_order: nf.sort_order,
    })
    summary.note_files++
  }

  const line = `sections=${summary.sections} pages=${summary.pages} notes=${summary.notes} note_files=${summary.note_files} files=${summary.files} skipped=${summary.skipped}`
  log(`SUCCESS | ${line}`)
  console.log(`\n✅ Restore complete: ${line}`)
  console.log('Note: restored records have new auto-generated ids — relations are preserved, raw ids from the original instance are not.')
}

main().catch((e) => fail(e.message))
