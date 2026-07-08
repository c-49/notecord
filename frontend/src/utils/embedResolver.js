// Resolves a pasted link into rich preview data via the same-origin Worker
// route (worker.js's /api/resolve-embed) — needed because the browser can't
// read another origin's page content (or og:* tags) directly. Returns null
// on any failure or empty result so callers can just fall back to the plain
// card, never treating this as a hard error.
export async function resolveEmbed(href) {
  try {
    const res = await fetch(`/api/resolve-embed?url=${encodeURIComponent(href)}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.title || data.description || data.thumbnail ? data : null
  } catch {
    return null
  }
}
