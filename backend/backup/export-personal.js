/**
 * NoteCord — per-user, on-demand notes export.
 *
 * Runs every minute via cron (not nightly like export-notes.js). Polls
 * export_requests for pending rows (created when a user clicks "Request
 * export" in the app), renders that ONE user's data only via
 * lib/build-export.js, uploads the result tagged with their owner_id (so
 * only they can read it back — see setup-schema.js's directus_files
 * permission), and marks the request ready.
 *
 * Exits immediately (no Puppeteer launch) if there's nothing pending, so
 * idle cron overhead is a single cheap HTTP call.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadEnv } = require('./lib/env')
const { buildExport } = require('./lib/build-export')

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

async function uploadFile(localPath, filename, ownerId) {
  const buf = fs.readFileSync(localPath)
  const form = new FormData()
  form.append('owner_id', ownerId)
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

// Keep exactly one request per user — delete their other requests (and
// whatever files those had) once this one settles, same "current copy
// only" approach as backup_status.
async function cleanupOldRequests(ownerId, keepId) {
  const others = await req('GET', `/items/export_requests?filter[owner_id][_eq]=${ownerId}&filter[id][_neq]=${keepId}&fields=id,files`)
  for (const row of others) {
    for (const fileId of Object.values(row.files ?? {})) {
      await req('DELETE', `/files/${fileId}`).catch(() => {})
    }
    await req('DELETE', `/items/export_requests/${row.id}`).catch(() => {})
  }
}

async function processRequest(request) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notecord-export-'))
  try {
    await req('PATCH', `/items/export_requests/${request.id}`, { status: 'processing' })

    const { pdfPath, htmlPath, docxPath, notes, pages } = await buildExport({
      ownerId: request.owner_id,
      outDir: tmpDir,
      title: 'My NoteCord Export',
    })

    const files = {
      html: await uploadFile(htmlPath, 'notecord-export.html', request.owner_id),
      pdf: await uploadFile(pdfPath, 'notecord-export.pdf', request.owner_id),
      docx: await uploadFile(docxPath, 'notecord-export.docx', request.owner_id),
    }

    await req('PATCH', `/items/export_requests/${request.id}`, {
      status: 'ready',
      completed_at: new Date().toISOString(),
      detail: `${notes.length} notes, ${pages.length} pages`,
      files,
    })
    console.log(`  ✓ request ${request.id} (owner ${request.owner_id}) ready: ${notes.length} notes, ${pages.length} pages`)

    await cleanupOldRequests(request.owner_id, request.id)
  } catch (e) {
    await req('PATCH', `/items/export_requests/${request.id}`, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      detail: e.message,
    }).catch(() => {})
    console.log(`  ✗ request ${request.id} (owner ${request.owner_id}) failed: ${e.message}`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function main() {
  const pending = await req('GET', '/items/export_requests?filter[status][_eq]=pending&limit=10')
  if (!pending.length) return

  console.log(`→ Processing ${pending.length} pending export request(s)…`)
  for (const request of pending) {
    await processRequest(request)
  }
}

main().catch((e) => {
  console.error(`❌ export-personal.js failed: ${e.message}`)
  process.exit(1)
})
