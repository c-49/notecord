/**
 * NoteCord — one-off backfill for pre-existing notes with no owner.
 *
 * Assigns every note where owner_id IS NULL to a given Directus user.
 * Safe to run more than once — if there's nothing left to backfill, it
 * logs that and exits without touching anything.
 *
 * Usage:
 *   node backend/backfill-note-owners.js --user-email you@example.com
 *   BACKFILL_USER_EMAIL=you@example.com node backend/backfill-note-owners.js
 *
 * Set DIRECTUS_URL / ADMIN_TOKEN env vars to override the backend/.env values.
 */

const fs = require('fs')
const path = require('path')

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return {}
  const out = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    const eq = trimmed.indexOf('=')
    if (!trimmed || trimmed.startsWith('#') || eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const envFile = loadEnvFile()
const BASE = process.env.DIRECTUS_URL ?? envFile.DIRECTUS_URL ?? 'http://localhost:8055'
const TOKEN = process.env.ADMIN_TOKEN ?? envFile.ADMIN_TOKEN

function parseUserEmailArg() {
  const flagIndex = process.argv.indexOf('--user-email')
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) return process.argv[flagIndex + 1]
  return process.env.BACKFILL_USER_EMAIL
}

async function req(method, urlPath, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json.errors?.[0]?.message ?? JSON.stringify(json)
    throw new Error(`${method} ${urlPath} → ${res.status}: ${msg}`)
  }
  return json.data ?? json
}

async function main() {
  if (!TOKEN) {
    throw new Error('ADMIN_TOKEN is not set. Set it in backend/.env or export it before running this script.')
  }

  const userEmail = parseUserEmailArg()
  if (!userEmail) {
    throw new Error(
      'No target user specified. Pass --user-email you@example.com or set BACKFILL_USER_EMAIL.'
    )
  }

  console.log(`\nConnecting to Directus at ${BASE}…\n`)

  const users = await req('GET', `/users?filter[email][_eq]=${encodeURIComponent(userEmail)}&limit=1`)
  const user = (users.data ?? users)[0]
  if (!user) {
    throw new Error(`No Directus user found with email "${userEmail}".`)
  }
  console.log(`✓ Found user "${userEmail}" (${user.id})`)

  const ownerless = await req(
    'GET',
    `/items/notes?filter[owner_id][_null]=true&fields=id&limit=-1`
  )
  const ids = (ownerless.data ?? ownerless).map((n) => n.id)

  if (ids.length === 0) {
    console.log('\nNothing to backfill — every note already has an owner.\n')
    return
  }

  await req('PATCH', '/items/notes', { keys: ids, data: { owner_id: user.id } })
  console.log(`\n✅ Backfilled ${ids.length} ownerless note(s) → owner_id = ${user.id} ("${userEmail}")\n`)
}

main().catch((e) => {
  console.error('\n❌ Backfill failed:', e.message)
  process.exit(1)
})
