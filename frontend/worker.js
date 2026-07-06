// Minimal Worker: serves the built static app for everything except
// /api/resolve-pin, which exists solely to resolve Pinterest's pin.it share
// links. Pinterest's embed widget doesn't follow that redirect itself, and
// the browser can't read a cross-origin redirect's Location header without
// pin.it granting CORS (it doesn't) — see src/utils/pinterestWidget.js for
// the frontend side of this.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/resolve-pin') {
      return resolvePin(url)
    }
    return env.ASSETS.fetch(request)
  },
}

async function resolvePin(url) {
  const target = url.searchParams.get('url')
  if (!target) return json({ error: 'missing url param' }, 400)

  let targetUrl
  try {
    targetUrl = new URL(target)
  } catch {
    return json({ error: 'invalid url' }, 400)
  }

  // Only ever follows Pinterest's own shortener — this isn't a general-purpose
  // redirect-following proxy, to keep the SSRF surface as small as possible.
  if (targetUrl.hostname.replace(/^www\./, '') !== 'pin.it') {
    return json({ error: 'unsupported host' }, 400)
  }

  let response
  try {
    response = await fetch(targetUrl.toString(), { redirect: 'follow' })
  } catch {
    return json({ error: 'resolve failed' }, 502)
  }
  // Only the final URL the redirect chain landed on is needed, not the body.
  await response.body?.cancel().catch(() => {})

  // pin.it share links commonly resolve to an invite-tracking wrapper
  // (/pin/<id>/sent/?invite_code=...) rather than the plain pin page — strip
  // that down to the canonical form the widget (and our own direct-paste
  // matcher) expect.
  const match = response.url.match(/^https:\/\/([a-z0-9-]+\.)?pinterest\.[a-z.]+\/pin\/(\d{6,25})/i)
  if (!match) return json({ error: 'not a pin' }, 422)

  return json({ url: `https://www.pinterest.com/pin/${match[2]}/` }, 200, { 'cache-control': 'public, max-age=86400' })
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  })
}
