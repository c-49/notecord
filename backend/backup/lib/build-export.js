/**
 * Shared HTML/PDF/DOCX/JSON export pipeline — used by both export-notes.js
 * (nightly, whole-instance, no filter) and export-personal.js (on-demand,
 * one user's data only via ownerId). Extracted so the two never drift:
 * the rendering logic is identical, only the data-fetch scope differs.
 */
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')
const HTMLtoDOCX = require('html-to-docx')
const { loadEnv } = require('./env')

const env = loadEnv()
const BASE = env.DIRECTUS_URL ?? 'http://localhost:8055'
const TOKEN = env.ADMIN_TOKEN
const ASSET_TOKEN = env.ASSET_TOKEN
const CSS_PATH = path.join(__dirname, '..', 'templates', 'export.css')

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

async function downloadAttachment(fileMeta, attachmentsDir, warnings) {
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

function renderDocument({ sections, pages, notesByPage, filesById, downloads }, css, title) {
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
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<h1 class="export-title">${escapeHtml(title)}</h1>
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

/**
 * @param {{ ownerId?: string|null, outDir: string, title?: string }} opts
 *   ownerId: when set, scopes sections/pages/notes/note_files to just that
 *   user (owner_id = ownerId) — note_files has no owner_id of its own, so
 *   it's fetched via the owner-filtered notes' ids, same relation the
 *   permission model already uses.
 * @returns {Promise<{ htmlPath, pdfPath, docxPath, jsonPath, sections, pages, notes, noteFiles, warnings }>}
 */
async function buildExport({ ownerId = null, outDir, title = 'NoteCord Export' }) {
  const warnings = []

  await req('GET', '/server/health').catch(() => {
    throw new Error('Cannot reach Directus.')
  })

  const ownerClause = ownerId ? `filter[owner_id][_eq]=${ownerId}` : ''
  const sections = await fetchAll('sections', ownerClause)
  const pages = await fetchAll('pages', ownerClause)
  const notes = await fetchAll('notes', [ownerClause, 'sort=date_created'].filter(Boolean).join('&'))

  const noteFiles = ownerId
    ? notes.length
      ? await fetchAll('note_files', `filter[note_id][_in]=${notes.map((n) => n.id).join(',')}`)
      : []
    : await fetchAll('note_files')

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
  const directusFiles = []
  for (const id of fileIds) {
    try {
      directusFiles.push(await req('GET', `/files/${id}`))
    } catch (e) {
      warnings.push(`directus_files ${id} metadata unavailable: ${e.message}`)
    }
  }
  const filesById = Object.fromEntries(directusFiles.map((f) => [f.id, f]))

  const attachmentsDir = path.join(outDir, 'attachments')
  fs.mkdirSync(attachmentsDir, { recursive: true })

  const downloads = {}
  for (const fileMeta of directusFiles) {
    downloads[fileMeta.id] = await downloadAttachment(fileMeta, attachmentsDir, warnings)
  }

  const css = fs.readFileSync(CSS_PATH, 'utf8')
  const html = renderDocument({ sections, pages, notesByPage, filesById, downloads }, css, title)

  const htmlPath = path.join(outDir, 'notecord-export.html')
  fs.writeFileSync(htmlPath, html)

  const pdfPath = path.join(outDir, 'notecord-export.pdf')
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' })
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    })
  } finally {
    await browser.close()
  }

  const docxHtml = inlineImagesForDocx(html, attachmentsDir)
  const docxBuffer = await HTMLtoDOCX(docxHtml, null, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false })
  const docxPath = path.join(outDir, 'notecord-export.docx')
  fs.writeFileSync(docxPath, docxBuffer)

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
  const jsonPath = path.join(outDir, 'notecord-export.json')
  fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2))

  return { htmlPath, pdfPath, docxPath, jsonPath, sections, pages, notes, noteFiles, warnings }
}

module.exports = { buildExport }
