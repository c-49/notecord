// A pasted URL that points at a YouTube video is rendered as a playable
// embed instead of a plain card. The iframe src is always rebuilt from a
// strictly-validated video ID — never the raw href — so a crafted href can
// never smuggle an arbitrary iframe src through this.
export function getYoutubeEmbedUrl(href) {
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  let id = null
  if (host === 'youtu.be') {
    id = url.pathname.slice(1)
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.slice('/embed/'.length)
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.slice('/shorts/'.length)
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null
  return `https://www.youtube-nocookie.com/embed/${id}`
}

// TikTok exposes a direct iframe player at /embed/v2/<id> (the same endpoint
// their own oEmbed response embeds under the hood), so — like YouTube above —
// this can be resolved entirely client-side with no oEmbed round-trip. Short
// links (vm.tiktok.com/vt.tiktok.com) redirect server-side and can't be
// resolved without following that redirect, so they fall through to the
// plain link-preview card instead.
export function getTiktokEmbedUrl(href) {
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'tiktok.com' && host !== 'm.tiktok.com') return null
  const id = url.pathname.match(/\/video\/(\d+)/)?.[1]
  if (!id || !/^\d{5,25}$/.test(id)) return null
  return `https://www.tiktok.com/embed/v2/${id}`
}

// Dispatches a href to the first recognized video provider, if any.
export function getVideoEmbed(href) {
  const youtube = getYoutubeEmbedUrl(href)
  if (youtube) return { provider: 'youtube', embedUrl: youtube }
  const tiktok = getTiktokEmbedUrl(href)
  if (tiktok) return { provider: 'tiktok', embedUrl: tiktok }
  return null
}

// Synchronous host/path check only (not the async pin.it-redirect resolution
// that pinterestWidget.js's resolvePinterestEmbedHref does) — good enough to
// know "this is a Pinterest link, don't send it to the generic resolver",
// which is all classifyEmbedProvider needs.
function isPinterestHref(href) {
  let url
  try {
    url = new URL(href)
  } catch {
    return false
  }
  const host = url.hostname.replace(/^www\./, '')
  return host === 'pin.it' || /^([a-z0-9-]+\.)?pinterest\.[a-z.]+$/i.test(host)
}

// Classifies a href into which embed path it should take:
// - 'youtube'/'tiktok': resolved entirely client-side, no network round-trip.
// - 'pinterest': upgraded to a live embed by NoteBlock's Pinterest widget
//   integration, also without hitting /api/resolve-embed.
// - 'resolver': everything else (including Twitter/X status URLs) — the
//   Worker decides internally whether that's a tweet (fxtwitter API) or a
//   generic page (Open Graph scrape); the frontend doesn't need to know
//   which before it gets a response.
export function classifyEmbedProvider(href) {
  if (getYoutubeEmbedUrl(href)) return 'youtube'
  if (getTiktokEmbedUrl(href)) return 'tiktok'
  if (isPinterestHref(href)) return 'pinterest'
  return 'resolver'
}
