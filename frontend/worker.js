// Minimal Worker: serves the built static app for everything except
// /api/resolve-pin, which exists solely to resolve Pinterest's pin.it share
// links. Pinterest's embed widget doesn't follow that redirect itself, and
// the browser can't read a cross-origin redirect's Location header without
// pin.it granting CORS (it doesn't) — see src/utils/pinterestWidget.js for
// the frontend side of this.
// /api/resolve-embed resolves a generic pasted link into rich preview data
// (og:title/description/image, or — for a Twitter/X status URL — a
// structured tweet card via fxtwitter's API) for the linkEmbed Tiptap node;
// see src/utils/embedResolver.js and src/components/composer/RichTextEditor.vue.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/resolve-pin') {
      return resolvePin(url)
    }
    if (url.pathname === '/api/resolve-embed') {
      return resolveEmbed(url)
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

async function resolveEmbed(url) {
  const target = url.searchParams.get('url')
  if (!target) return json({ error: 'missing url param' }, 400)

  let targetUrl
  try {
    targetUrl = new URL(target)
  } catch {
    return json({ error: 'invalid url' }, 400)
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return json({ error: 'unsupported scheme' }, 400)
  }
  if (isPrivateHost(targetUrl.hostname)) {
    return json({ error: 'unsupported host' }, 400)
  }

  const host = targetUrl.hostname.replace(/^www\./, '')
  const tweetMatch =
    (host === 'twitter.com' || host === 'x.com') &&
    targetUrl.pathname.match(/^\/[\w-]+\/status\/(\d+)/)

  const data = tweetMatch ? await resolveTweet(tweetMatch[1]) : await scrapeOpenGraph(targetUrl)
  return json(data ?? {}, 200, { 'cache-control': 'public, max-age=86400' })
}

// Only ever fetches a fixed trusted host (api.fxtwitter.com), using a status
// ID that's already been regex-validated as digits-only above — never the
// caller's raw href — same "rebuild from a validated ID" pattern the
// frontend already uses for YouTube/TikTok iframe src values. A UA header is
// required — fxtwitter's API 401s Workers' default fetch User-Agent.
async function resolveTweet(id) {
  try {
    const res = await fetch(`https://api.fxtwitter.com/status/${id}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NoteCordBot/1.0)' },
    })
    if (!res.ok) return null
    const body = await res.json()
    const tweet = body?.tweet
    if (!tweet) return null
    const media = tweet.media?.photos?.[0] ?? tweet.media?.videos?.[0]
    return {
      kind: 'tweet',
      title: tweet.author?.name ?? null,
      description: tweet.text ?? null,
      thumbnail: media?.thumbnail_url ?? media?.url ?? null,
      authorName: tweet.author?.name ?? null,
      authorHandle: tweet.author?.screen_name ?? null,
      authorAvatar: tweet.author?.avatar_url ?? null,
    }
  } catch {
    return null
  }
}

// og:* tags always live in <head>, so the response body is streamed with a
// hard cap instead of buffering a potentially huge page.
const MAX_SCRAPE_BYTES = 100_000

async function scrapeOpenGraph(targetUrl) {
  let response
  try {
    response = await fetch(targetUrl.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NoteCordBot/1.0)' },
    })
  } catch {
    return null
  }
  if (!response.body) {
    await response.body?.cancel().catch(() => {})
    return null
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  try {
    while (html.length < MAX_SCRAPE_BYTES && !/<\/head>/i.test(html)) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  const title = matchMetaContent(html, 'og:title') ?? matchTitleTag(html)
  const description = matchMetaContent(html, 'og:description')
  let thumbnail = matchMetaContent(html, 'og:image')
  if (thumbnail) {
    try {
      thumbnail = new URL(thumbnail, response.url).toString()
    } catch {
      thumbnail = null
    }
  }
  if (!title && !description && !thumbnail) return null
  return { kind: 'article', title, description, thumbnail }
}

// Matches either attribute order (property/content or content/property) —
// simple regex extraction, no HTML parser dependency, matching this file's
// existing lightweight style.
function matchMetaContent(html, property) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']` +
      `|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    'i'
  )
  const match = html.match(re)
  const raw = match?.[1] ?? match?.[2]
  return raw ? decodeHtmlEntities(raw) : null
}

function matchTitleTag(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match ? decodeHtmlEntities(match[1].trim()) : null
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

// String-level SSRF guard against the common accidental cases (loopback,
// RFC1918 private ranges, link-local) — not full DNS-rebind protection,
// which is out of scope for a single-user personal app with no internal
// network for a Worker to pivot into.
function isPrivateHost(hostname) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '::1') return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  return false
}
