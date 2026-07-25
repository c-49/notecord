/**
 * Shared backend/.env loader for the backup scripts — same convention as
 * setup-schema.js: these scripts run as bare `node`, so nothing loads
 * backend/.env into process.env automatically.
 */
const fs = require('fs')
const path = require('path')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env')
  const fromFile = {}
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      const eq = trimmed.indexOf('=')
      if (!trimmed || trimmed.startsWith('#') || eq === -1) continue
      fromFile[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  }
  return new Proxy(fromFile, {
    get(target, key) {
      return process.env[key] ?? target[key]
    },
  })
}

module.exports = { loadEnv }
