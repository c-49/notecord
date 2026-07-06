// Pinterest has no direct "iframe src" embed endpoint like YouTube/TikTok —
// pins can only be rendered by loading Pinterest's own widget script, which
// scans the DOM for `<a data-pin-do="embedPin">` anchors and replaces them
// with an iframe. That DOM mutation is only safe to run against the static
// (v-html) note view, never inside the live ProseMirror-managed editor, so
// this is invoked from NoteBlock's read-only render only.
const SCRIPT_SRC = 'https://assets.pinterest.com/js/pinit.js'

let loadPromise = null

export function ensurePinterestWidget() {
  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      if (window.PinUtils) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      document.head.appendChild(script)
    })
  }
  return loadPromise
}

// Safe to call repeatedly — PinUtils.build() only converts anchors it hasn't
// already processed, so re-running it after new notes render is a no-op for
// pins it already turned into embeds.
export async function buildPinterestEmbeds() {
  await ensurePinterestWidget()
  window.PinUtils?.build()
}

function isFullPinUrl(url) {
  const host = url.hostname.replace(/^www\./, '')
  return /^pinterest\.[a-z.]+$/i.test(host) && /\/pin\/[\w-]*\d{6,25}\/?$/.test(url.pathname)
}

// pin.it — Pinterest's own share-button shortener — redirects server-side to
// a full pin URL. Pinterest's widget doesn't follow that redirect itself (it
// silently no-ops on an unrecognized href), and the browser can't read a
// cross-origin redirect's Location header without pin.it granting CORS
// (it doesn't), so resolving it needs a same-origin backend hop — see
// worker.js's /api/resolve-pin, which only ever follows pin.it redirects.
async function resolveShortPinUrl(href) {
  try {
    const res = await fetch(`/api/resolve-pin?url=${encodeURIComponent(href)}`)
    if (!res.ok) return null
    const { url } = await res.json()
    return url || null
  } catch {
    return null
  }
}

// Returns the href to embed a pin with (resolving pin.it first if needed), or
// null if this isn't a Pinterest pin link at all.
export async function resolvePinterestEmbedHref(href) {
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'pin.it') return url.pathname.length > 1 ? resolveShortPinUrl(href) : null
  return isFullPinUrl(url) ? href : null
}
