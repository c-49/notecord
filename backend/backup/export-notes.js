/**
 * NoteCord — human-readable export (HTML + PDF + DOCX) plus a JSON manifest.
 *
 * Usage:
 *   node export-notes.js
 *
 * Reads DIRECTUS_URL / ADMIN_TOKEN / ASSET_TOKEN / BACKUP_RETENTION_COUNT /
 * R2_BUCKET / R2_BACKUP_PREFIX from backend/.env (same convention as
 * setup-schema.js). See README.md.
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const puppeteer = require('puppeteer')
const HTMLtoDOCX = require('html-to-docx')
const { loadEnv } = require('./lib/env')

const env = loadEnv()
const BASE = env.DIRECTUS_URL ?? 'http://localhost:8055'
const TOKEN = env.ADMIN_TOKEN
const ASSET_TOKEN = env.ASSET_TOKEN
const RETENTION = parseInt(env.BACKUP_RETENTION_COUNT ?? '14', 10)
const R2_BUCKET = env.R2_BUCKET
const R2_BACKUP_PREFIX = env.R2_BACKUP_PREFIX ?? 'notecord'

const BACKUP_DIR = __dirname
const EXPORT_ROOT = path.join(BACKUP_DIR, 'export')
const LOG_FILE = path.join(EXPORT_ROOT, 'export.log')
const CSS_PATH = path.join(BACKUP_DIR, 'templates', 'export.css')

const warnings = []

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

// ── Directus REST helpers ────────────────────────────────────────────────────

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

// Directus caps results per request — loop with limit/offset until a short page comes back.
async function fetchAll(collection, query = '') {
  const out = []
  const limit = 100
  let offset = 0
  for (;;) {
    const sep = query ? '&' : ''
    const page = await req('GET', `/items/${collection}?limit=${limit}&offset=${offset}${sep}${query}`)
    out.push(...page)
    if (page.length < limit) break
    offset += limit
  }
  return out
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

function formatDate(iso) {
  if (!iso) return 'Unknown date'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

function formatBytes(bytes) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
  'application/pdf': 'pdf', 'video/webm': 'webm', 'video/mp4': 'mp4',
}

function extFor(fileMeta) {
  const fromName = fileMeta.filename_download ? path.extname(fileMeta.filename_download).replace(/^\./, '') : ''
  if (fromName) return fromName
  return MIME_EXT[fileMeta.type] ?? 'bin'
}

// ── Attachment download ──────────────────────────────────────────────────────

async function downloadAttachment(fileMeta, attachmentsDir) {
  const url = `${BASE}/assets/${fileMeta.id}?access_token=${ASSET_TOKEN}`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const filename = `${fileMeta.id}.${extFor(fileMeta)}`
    fs.writeFileSync(path.join(attachmentsDir, filename), buf)
    return { ok: true, filename }
  } catch (e) {
    warnings.push(`attachment ${fileMeta.id} (${fileMeta.filename_download ?? 'unknown'}) failed to download: ${e.message}`)
    return { ok: false, error: e.message }
  }
}

// ── HTML rendering ───────────────────────────────────────────────────────────

function renderAttachment(nf, filesById, downloads) {
  if (nf.attachment_type === 'embed') {
    const url = nf.embed_url ?? ''
    return `<a class="attachment-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(url)}</a>`
  }

  const fileMeta = nf.file_id ? filesById[nf.file_id] : null
  const dl = nf.file_id ? downloads[nf.file_id] : null

  if (!fileMeta || !dl?.ok) {
    const label = fileMeta?.filename_download ?? nf.file_id ?? 'unknown'
    return `<div class="attachment-missing">[attachment unavailable: ${escapeHtml(label)}]</div>`
  }

  const localPath = `attachments/${dl.filename}`
  if (nf.attachment_type === 'image') {
    return `<img src="${localPath}" alt="${escapeHtml(fileMeta.filename_download ?? 'image')}">`
  }

  const icon = nf.attachment_type === 'voice' ? '🎤' : '📎'
  const size = formatBytes(fileMeta.filesize)
  return `<a class="attachment-link" href="${localPath}">${icon} ${escapeHtml(fileMeta.filename_download ?? 'file')}${size ? ` <span class="size">(${size})</span>` : ''}</a>`
}

function renderNote(note, filesById, downloads) {
  const files = (note.files ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  const attachmentsHtml = files.map((nf) => renderAttachment(nf, filesById, downloads)).join('\n')
  return `<div class="note">
    <div class="note-timestamp">${formatDate(note.date_created)}</div>
    <div class="note-content">${note.content ?? ''}${attachmentsHtml}</div>
  </div>`
}

function renderPage(page, notesByPage, filesById, downloads) {
  const notes = (notesByPage[page.id] ?? []).slice().sort((a, b) => new Date(a.date_created) - new Date(b.date_created))
  const body = notes.length
    ? notes.map((n) => renderNote(n, filesById, downloads)).join('\n')
    : '<p class="no-notes">No notes.</p>'
  return `<h3 class="page-title">${escapeHtml(page.emoji ?? '')} ${escapeHtml(page.name)}</h3>\n${body}`
}

function renderDocument({ sections, pages, notesByPage, filesById, downloads }, css) {
  const pagesBySection = {}
  for (const page of pages) {
    const key = page.section_id ?? '__uncategorized__'
    ;(pagesBySection[key] ??= []).push(page)
  }

  const sortedSections = sections.slice().sort((a, b) => a.sort_order - b.sort_order)
  const sectionBlocks = sortedSections.map((section) => {
    const sectionPages = (pagesBySection[section.id] ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
    const pageHtml = sectionPages.map((p) => renderPage(p, notesByPage, filesById, downloads)).join('\n')
    return `<h2 class="section-title">${escapeHtml(section.emoji ?? '')} ${escapeHtml(section.name)}</h2>\n${pageHtml}`
  })

  const uncategorizedPages = (pagesBySection.__uncategorized__ ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  if (uncategorizedPages.length) {
    const pageHtml = uncategorizedPages.map((p) => renderPage(p, notesByPage, filesById, downloads)).join('\n')
    sectionBlocks.push(`<h2 class="section-title">Uncategorized</h2>\n${pageHtml}`)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NoteCord Export</title>
<style>${css}</style>
</head>
<body>
<h1 class="export-title">NoteCord Export</h1>
<div class="export-meta">Generated ${formatDate(new Date().toISOString())}</div>
${sectionBlocks.join('\n')}
</body>
</html>`
}

// For DOCX conversion only: html-to-docx needs image bytes it can reach
// directly, not a relative "attachments/x.jpg" path — swap those <img> src
// for base64 data URIs. The saved .html/.pdf keep the relative-path version.
function inlineImagesForDocx(html, attachmentsDir) {
  return html.replace(/<img src="attachments\/([^"]+)"([^>]*)>/g, (match, filename, rest) => {
    try {
      const buf = fs.readFileSync(path.join(attachmentsDir, filename))
      const ext = path.extname(filename).replace(/^\./, '') || 'png'
      const mime = ext === 'jpg' ? 'jpeg' : ext
      return `<img src="data:image/${mime};base64,${buf.toString('base64')}"${rest}>`
    } catch {
      return match
    }
  })
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

// Best-effort status ping for the frontend's "Last backup" sidebar indicator
// (backup_status collection, see setup-schema.js). Never throws — the
// actual export already succeeded by the time this is called.
async function reportStatus(type, detail) {
  try {
    const existing = await req('GET', `/items/backup_status?filter[type][_eq]=${type}&limit=1&fields=id`)
    const body = { type, last_success_at: new Date().toISOString(), detail }
    if (existing[0]) {
      await req('PATCH', `/items/backup_status/${existing[0].id}`, body)
    } else {
      await req('POST', '/items/backup_status', body)
    }
  } catch (e) {
    console.log(`  ↳ (non-fatal) failed to report backup_status: ${e.message}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now()

  if (!TOKEN) fail('ADMIN_TOKEN is not set in backend/.env')
  if (!ASSET_TOKEN) fail('ASSET_TOKEN is not set in backend/.env')

  console.log(`\nConnecting to Directus at ${BASE}…`)
  await req('GET', '/server/health').catch(() => fail('Cannot reach Directus. Is `docker compose up -d` running in backend/?'))
  console.log('✓ Directus is reachable\n')

  console.log('→ Fetching sections, pages, notes, note_files…')
  const sections = await fetchAll('sections')
  const pages = await fetchAll('pages')
  const notes = await fetchAll('notes', 'sort=date_created')
  const noteFiles = await fetchAll('note_files')
  console.log(`  ${sections.length} sections, ${pages.length} pages, ${notes.length} notes, ${noteFiles.length} attachments`)

  const notesByPage = {}
  for (const note of notes) {
    ;(notesByPage[note.page_id] ??= []).push({ ...note, files: [] })
  }
  const noteById = {}
  for (const list of Object.values(notesByPage)) for (const n of list) noteById[n.id] = n
  for (const nf of noteFiles) {
    noteById[nf.note_id]?.files.push(nf)
  }

  const fileIds = [...new Set(noteFiles.filter((nf) => nf.file_id).map((nf) => nf.file_id))]
  console.log(`→ Fetching metadata for ${fileIds.length} referenced files…`)
  const directusFiles = []
  for (const id of fileIds) {
    try {
      directusFiles.push(await req('GET', `/files/${id}`))
    } catch (e) {
      warnings.push(`directus_files ${id} metadata unavailable: ${e.message}`)
    }
  }
  const filesById = Object.fromEntries(directusFiles.map((f) => [f.id, f]))

  const runId = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '') + 'Z'
  const runDir = path.join(EXPORT_ROOT, runId)
  const attachmentsDir = path.join(runDir, 'attachments')
  fs.mkdirSync(attachmentsDir, { recursive: true })

  console.log('→ Downloading attachments…')
  const downloads = {}
  for (const fileMeta of directusFiles) {
    downloads[fileMeta.id] = await downloadAttachment(fileMeta, attachmentsDir)
  }

  const css = fs.readFileSync(CSS_PATH, 'utf8')
  const html = renderDocument({ sections, pages, notesByPage, filesById, downloads }, css)

  const htmlPath = path.join(runDir, 'notecord-export.html')
  fs.writeFileSync(htmlPath, html)
  console.log(`✓ Wrote ${htmlPath}`)

  console.log('→ Rendering PDF via Puppeteer…')
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' })
    await page.pdf({
      path: path.join(runDir, 'notecord-export.pdf'),
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    })
  } finally {
    await browser.close()
  }
  console.log('✓ Wrote notecord-export.pdf')

  console.log('→ Rendering DOCX…')
  const docxHtml = inlineImagesForDocx(html, attachmentsDir)
  const docxBuffer = await HTMLtoDOCX(docxHtml, null, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false })
  fs.writeFileSync(path.join(runDir, 'notecord-export.docx'), docxBuffer)
  console.log('✓ Wrote notecord-export.docx')

  const manifest = {
    generated_at: new Date().toISOString(),
    sections,
    pages,
    notes,
    note_files: noteFiles,
    directus_files: directusFiles,
    attachments: Object.fromEntries(
      Object.entries(downloads).filter(([, d]) => d.ok).map(([id, d]) => [id, d.filename])
    ),
  }
  fs.writeFileSync(path.join(runDir, 'notecord-export.json'), JSON.stringify(manifest, null, 2))
  console.log('✓ Wrote notecord-export.json')

  applyRetention()
  syncToR2(runDir, runId)
  await reportStatus('export', `${notes.length} notes, ${pages.length} pages`)

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
