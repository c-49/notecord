/**
 * NoteCord — Directus schema setup
 * Run once after `docker compose up -d` to create all collections and fields.
 *
 * Usage:
 *   node backend/setup-schema.js
 *
 * Set DIRECTUS_URL / ADMIN_TOKEN / ASSET_TOKEN env vars to override defaults.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// This script is invoked as a bare `node setup-schema.js` (see README), so
// nothing loads backend/.env into process.env automatically — read it directly.
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
const ASSET_TOKEN = process.env.ASSET_TOKEN ?? envFile.ASSET_TOKEN
const APP_USER_EMAIL = process.env.APP_USER_EMAIL ?? envFile.APP_USER_EMAIL
const APP_USER_PASSWORD = process.env.APP_USER_PASSWORD ?? envFile.APP_USER_PASSWORD
const DB_USER = process.env.DB_USER ?? envFile.DB_USER
const DB_DATABASE = process.env.DB_DATABASE ?? envFile.DB_DATABASE

// Directus's schema API (createField/createRelation) has no way to express a
// partial unique index, so section_access's uniqueness constraint (below)
// goes straight to Postgres via `docker compose exec`, piping SQL over
// stdin to sidestep shell-quoting issues. Idempotent (IF NOT EXISTS) like
// everything else in this script.
function runSql(sql) {
  const { execSync } = require('child_process')
  execSync(`docker compose exec -T database psql -U ${DB_USER} -d ${DB_DATABASE} -v ON_ERROR_STOP=1`, {
    cwd: __dirname,
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
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
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`)
  }
  return json.data ?? json
}

async function findOne(collection, filterField, filterValue) {
  const res = await req('GET', `/${collection}?filter[${filterField}][_eq]=${encodeURIComponent(filterValue)}&limit=1`)
  const data = res.data ?? res
  return data[0] ?? null
}

async function collectionExists(name) {
  try {
    await req('GET', `/collections/${name}`)
    return true
  } catch {
    return false
  }
}

async function createCollection(name, fields, meta = {}) {
  if (await collectionExists(name)) {
    console.log(`  ↳ collection "${name}" already exists, skipping`)
    return
  }
  // `schema: {}` is required in Directus 11 to create a real DB table.
  // Omitting it produces a virtual/metadata-only collection with no table.
  await req('POST', '/collections', { collection: name, schema: {}, fields, meta })
  console.log(`  ✓ created collection "${name}"`)
}

async function createField(collection, field) {
  try {
    await req('GET', `/fields/${collection}/${field.field}`)
    console.log(`  ↳ field "${collection}.${field.field}" already exists, skipping`)
  } catch {
    await req('POST', `/fields/${collection}`, field)
    console.log(`  ✓ created field "${collection}.${field.field}"`)
  }
}

async function relationExists(collection, field) {
  try {
    const data = await req('GET', `/relations/${collection}/${field}`)
    return !!data
  } catch {
    return false
  }
}

async function createRelation(collection, field, relatedCollection, onDelete = 'SET NULL', meta = null) {
  if (await relationExists(collection, field)) {
    console.log(`  ↳ relation "${collection}.${field}" already exists, skipping`)
    return
  }
  await req('POST', '/relations', {
    collection,
    field,
    related_collection: relatedCollection,
    schema: { on_delete: onDelete },
    ...(meta ? { meta } : {}),
  })
  console.log(`  ✓ created relation ${collection}.${field} → ${relatedCollection}`)
}

// Unlike createField/createRelation (create-once, skip-if-exists), permission
// *rules* on a collection/action can legitimately need to change on a
// re-run (e.g. tightening an existing blanket grant to an ownership filter)
// — so this converges to the desired state every run instead of skipping
// once a permission row exists.
async function upsertPermission(policyId, collection, action, { fields = '*', permissions = {}, presets = null } = {}) {
  const existingResp = await req(
    'GET',
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`
  )
  const existing = (existingResp.data ?? existingResp)[0]
  const body = { policy: policyId, collection, action, fields, permissions, ...(presets ? { presets } : {}) }
  if (existing) {
    await req('PATCH', `/permissions/${existing.id}`, body)
  } else {
    await req('POST', '/permissions', body)
  }
  console.log(`  ✓ ${collection}:${action} set for policy ${policyId}`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// UUID v4 primary key — client-generated on every create (see navStore.js /
// notesStore.js), but `special: ['uuid']` also has Directus auto-populate it
// if a record is ever created without one supplied (e.g. via the admin UI).
const primaryKey = () => ({
  field: 'id',
  type: 'uuid',
  meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
  schema: { is_primary_key: true, is_nullable: false },
})

const stringField = (field, nullable = true, defaultValue = null) => ({
  field,
  type: 'string',
  meta: { interface: 'input', required: !nullable },
  schema: { is_nullable: nullable, default_value: defaultValue },
})

const intField = (field, defaultValue = 0) => ({
  field,
  type: 'integer',
  meta: { interface: 'input-integer' },
  schema: { is_nullable: true, default_value: defaultValue },
})

const textField = (field) => ({
  field,
  type: 'text',
  meta: { interface: 'input-multiline' },
  schema: { is_nullable: true },
})

const dateField = (field, special) => ({
  field,
  type: 'timestamp',
  meta: { interface: 'datetime', special: [special], readonly: true, hidden: false },
  schema: { is_nullable: true },
})

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!TOKEN) {
    throw new Error(
      'ADMIN_TOKEN is not set. Set it in backend/.env or export it before running this script.'
    )
  }
  if (!ASSET_TOKEN) {
    throw new Error(
      'ASSET_TOKEN is not set. Set it in backend/.env or export it before running this script.'
    )
  }
  if (!APP_USER_EMAIL || !APP_USER_PASSWORD) {
    throw new Error(
      'APP_USER_EMAIL / APP_USER_PASSWORD is not set. Set them in backend/.env or export before running this script.'
    )
  }

  console.log(`\nConnecting to Directus at ${BASE}…\n`)

  // Verify connectivity
  await req('GET', '/server/health').catch(() => {
    throw new Error('Cannot reach Directus. Is `docker compose up -d` running in backend/?')
  })
  console.log('✓ Directus is reachable\n')

  // ── sections ────────────────────────────────────────────────────────────────
  console.log('Creating "sections" collection…')
  await createCollection(
    'sections',
    [
      primaryKey(),
      stringField('name', false),
      stringField('emoji', true),
      intField('sort_order', 0),
    ],
    { icon: 'folder_open', sort_field: 'sort_order' }
  )

  // ── pages ────────────────────────────────────────────────────────────────────
  console.log('Creating "pages" collection…')
  await createCollection(
    'pages',
    [
      primaryKey(),
      stringField('name', false),
      stringField('emoji', true),
      { field: 'section_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } },
      intField('sort_order', 0),
    ],
    { icon: 'article', sort_field: 'sort_order' }
  )

  // ── notes ────────────────────────────────────────────────────────────────────
  console.log('Creating "notes" collection…')
  await createCollection(
    'notes',
    [
      primaryKey(),
      { field: 'page_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', required: true }, schema: { is_nullable: false } },
      textField('content'),
      // Attachments live entirely in note_files (supports multiple, mixed-type
      // attachments per note) — a single enum on the note itself can't represent
      // that, so whether a note "has attachments" is just `files.length > 0`.
      dateField('date_created', 'date-created'),
      dateField('date_updated', 'date-updated'),
    ],
    { icon: 'notes', sort_field: 'date_created' }
  )

  // ── note_files ───────────────────────────────────────────────────────────────
  console.log('Creating "note_files" collection…')
  await createCollection(
    'note_files',
    [
      primaryKey(),
      { field: 'note_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', required: true }, schema: { is_nullable: false } },
      { field: 'file_id', type: 'uuid', meta: { interface: 'file' }, schema: { is_nullable: true } },
      { ...stringField('attachment_type', false, 'file'), schema: { is_nullable: false, default_value: 'file' } },
      stringField('embed_url', true),
      intField('sort_order', 0),
    ],
    { icon: 'attach_file', sort_field: 'sort_order' }
  )

  // ── section_access ───────────────────────────────────────────────────────────
  // A grant of viewer/editor access to a section (page_id: null) or a single
  // page within it (page_id: set), given by the section's owner to another
  // user. See notes/notecord-sharing-feature-prompt.md for the full design.
  console.log('Creating "section_access" collection…')
  await createCollection(
    'section_access',
    [
      primaryKey(),
      { field: 'section_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', required: true }, schema: { is_nullable: false } },
      { field: 'page_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } },
      { field: 'user_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', required: true }, schema: { is_nullable: false } },
      { ...stringField('role', false, 'viewer'), meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Viewer', value: 'viewer' }, { text: 'Editor', value: 'editor' }] }, required: true }, schema: { is_nullable: false, default_value: 'viewer' } },
      { field: 'granted_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } },
      dateField('date_created', 'date-created'),
    ],
    { icon: 'share' }
  )
  await createRelation('section_access', 'section_id', 'sections', 'CASCADE', { one_field: 'section_access' })
  await createRelation('section_access', 'page_id', 'pages', 'CASCADE', { one_field: 'section_access' })
  await createRelation('section_access', 'user_id', 'directus_users', 'CASCADE')
  await createRelation('section_access', 'granted_by', 'directus_users', 'SET NULL')

  // Plain unique index on (section_id, page_id, user_id) can't stop duplicate
  // whole-section grants — Postgres treats NULL != NULL, so two page_id:null
  // rows for the same section/user wouldn't collide. Two partial indexes
  // instead: one for the whole-section case, one for the page-level case.
  console.log('Ensuring section_access uniqueness indexes…')
  runSql(`
    CREATE UNIQUE INDEX IF NOT EXISTS section_access_whole_section_unique
      ON section_access (section_id, user_id) WHERE page_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS section_access_page_unique
      ON section_access (section_id, page_id, user_id) WHERE page_id IS NOT NULL;
  `)
  console.log('  ✓ section_access uniqueness indexes present')

  // Directus's declarative `permissions` filter is NOT enforced on the
  // `create` action for a relational dot-path — confirmed empirically: a
  // non-owner could create a section_access grant on someone else's
  // section, and a viewer could attach a note_files row to a note they
  // didn't own, despite both permission rows having the "right" filter
  // shape. `validation` doesn't help either: it checks the literal
  // submitted payload rather than resolving the relation, so it just
  // rejects *everyone*, including legitimate owners. A Directus Flow (event
  // trigger, type 'filter', scope 'items.create') is the only mechanism
  // that can actually read the related row and decide — see
  // notes/notecord-sharing-feature-prompt.md for the full writeup. Recreated
  // from scratch on every run (delete-if-exists) rather than patched in
  // place — simpler to keep correct than diffing a 3-operation graph, and
  // nothing else references these flows' generated ids.
  async function upsertCreateOwnerGuardFlow(name, collection, relatedField, relatedCollection) {
    const existing = await findOne('flows', 'name', name)
    if (existing) {
      await req('DELETE', `/flows/${existing.id}`)
    }

    const flow = await req('POST', '/flows', {
      name,
      icon: 'bolt',
      status: 'active',
      trigger: 'event',
      accountability: 'all',
      options: { type: 'filter', scope: ['items.create'], collections: [collection] },
    })

    const readOp = await req('POST', '/operations', {
      name: `Read ${relatedCollection}`,
      key: 'read_related',
      type: 'item-read',
      position_x: 19,
      position_y: 1,
      options: {
        collection: relatedCollection,
        key: `{{$trigger.payload.${relatedField}}}`,
        query: { fields: ['owner_id'] },
      },
      flow: flow.id,
    })

    const throwOp = await req('POST', '/operations', {
      name: 'Reject (not owner)',
      key: 'reject_not_owner',
      type: 'exec',
      position_x: 39,
      position_y: 3,
      options: {
        code: `module.exports = async function() {\n  throw new Error('Only the owner of the related ${relatedCollection} row may do this.');\n};`,
      },
      flow: flow.id,
    })

    const condOp = await req('POST', '/operations', {
      name: 'Check owner',
      key: 'check_owner',
      type: 'condition',
      position_x: 19,
      position_y: 3,
      options: { filter: { read_related: { owner_id: { _eq: '{{$accountability.user}}' } } } },
      flow: flow.id,
      resolve: null,
      reject: throwOp.id,
    })

    await req('PATCH', `/operations/${readOp.id}`, { resolve: condOp.id })
    await req('PATCH', `/flows/${flow.id}`, { operation: readOp.id })
    console.log(`  ✓ (re)created flow "${name}" (${collection}:create guarded by ${relatedCollection}.owner_id)`)
  }

  console.log('Setting up create-time ownership guard flows (section_access, note_files)…')
  await upsertCreateOwnerGuardFlow(
    'Guard: section_access create requires section ownership',
    'section_access',
    'section_id',
    'sections'
  )
  await upsertCreateOwnerGuardFlow(
    'Guard: note_files create requires note ownership',
    'note_files',
    'note_id',
    'notes'
  )

  // pages:create and notes:create turn out to have the exact same
  // create-action gap, but pre-existing and unrelated to sharing — there
  // was NEVER a check that section_id/page_id in the payload belongs to the
  // caller. Any authenticated app user could inject a page into someone
  // else's section, or a note into someone else's page, with zero
  // relationship between them (confirmed empirically). Harmless while
  // APP_USER_EMAIL was the only real account; live risk now that the app is
  // genuinely multi-user. These two guards are one step more complex than
  // the pair above — "owner OR a qualifying grant exists" rather than just
  // "owner" — so unlike upsertCreateOwnerGuardFlow they're written out
  // directly rather than forced through a shared helper.
  async function upsertFlow(name, collection, operations) {
    const existing = await findOne('flows', 'name', name)
    if (existing) await req('DELETE', `/flows/${existing.id}`)

    const flow = await req('POST', '/flows', {
      name,
      icon: 'bolt',
      status: 'active',
      trigger: 'event',
      accountability: 'all',
      options: { type: 'filter', scope: ['items.create'], collections: [collection] },
    })

    const created = {}
    for (const op of operations) {
      created[op.key] = await req('POST', '/operations', { ...op.body, key: op.key, flow: flow.id })
    }
    for (const op of operations) {
      const patch = {}
      if (op.resolveKey !== undefined) patch.resolve = op.resolveKey ? created[op.resolveKey].id : null
      if (op.rejectKey !== undefined) patch.reject = op.rejectKey ? created[op.rejectKey].id : null
      if (Object.keys(patch).length) await req('PATCH', `/operations/${created[op.key].id}`, patch)
    }
    await req('PATCH', `/flows/${flow.id}`, { operation: created[operations[0].key].id })
    console.log(`  ✓ (re)created flow "${name}"`)
  }

  await upsertFlow('Guard: pages create requires section ownership or editor grant', 'pages', [
    {
      key: 'read_section',
      body: {
        name: 'Read Section',
        type: 'item-read',
        position_x: 19,
        position_y: 1,
        options: { collection: 'sections', key: '{{$trigger.payload.section_id}}', query: { fields: ['owner_id'] } },
      },
      resolveKey: 'is_owner',
    },
    {
      key: 'is_owner',
      body: {
        name: 'Is owner?',
        type: 'condition',
        position_x: 19,
        position_y: 3,
        options: { filter: { read_section: { owner_id: { _eq: '{{$accountability.user}}' } } } },
      },
      resolveKey: null, // condition true → allow, stop here
      rejectKey: 'read_grant',
    },
    {
      key: 'read_grant',
      body: {
        name: 'Read whole-section editor grant',
        type: 'item-read',
        position_x: 39,
        position_y: 5,
        options: {
          collection: 'section_access',
          query: {
            filter: {
              section_id: { _eq: '{{$trigger.payload.section_id}}' },
              user_id: { _eq: '{{$accountability.user}}' },
              role: { _eq: 'editor' },
              page_id: { _null: true },
            },
            limit: 1,
          },
        },
      },
      resolveKey: 'check_grant',
    },
    {
      key: 'check_grant',
      body: {
        name: 'Check grant found',
        type: 'exec',
        position_x: 59,
        position_y: 3,
        options: {
          code: "module.exports = async function(data) {\n  if (Array.isArray(data.read_grant) && data.read_grant.length > 0) return true;\n  throw new Error('Only the section owner or a whole-section editor may create a page here.');\n};",
        },
      },
    },
  ])

  await upsertFlow('Guard: notes create requires page ownership or a matching grant', 'notes', [
    {
      key: 'read_page',
      body: {
        name: 'Read Page',
        type: 'item-read',
        position_x: 19,
        position_y: 1,
        options: { collection: 'pages', key: '{{$trigger.payload.page_id}}', query: { fields: ['owner_id', 'section_id'] } },
      },
      resolveKey: 'is_owner',
    },
    {
      key: 'is_owner',
      body: {
        name: 'Is owner?',
        type: 'condition',
        position_x: 19,
        position_y: 3,
        options: { filter: { read_page: { owner_id: { _eq: '{{$accountability.user}}' } } } },
      },
      resolveKey: null,
      rejectKey: 'read_grant',
    },
    {
      key: 'read_grant',
      // Any role — viewers can post too (see the sharing feature doc's
      // "viewers can post" decision). Direct page grant OR inherited
      // whole-section grant, either is sufficient.
      body: {
        name: 'Read direct or whole-section grant',
        type: 'item-read',
        position_x: 39,
        position_y: 5,
        options: {
          collection: 'section_access',
          query: {
            filter: {
              _or: [
                { page_id: { _eq: '{{$trigger.payload.page_id}}' }, user_id: { _eq: '{{$accountability.user}}' } },
                { section_id: { _eq: '{{read_page.section_id}}' }, page_id: { _null: true }, user_id: { _eq: '{{$accountability.user}}' } },
              ],
            },
            limit: 1,
          },
        },
      },
      resolveKey: 'check_grant',
    },
    {
      key: 'check_grant',
      body: {
        name: 'Check grant found',
        type: 'exec',
        position_x: 59,
        position_y: 3,
        options: {
          code: "module.exports = async function(data) {\n  if (Array.isArray(data.read_grant) && data.read_grant.length > 0) return true;\n  throw new Error('No access to post here.');\n};",
        },
      },
    },
  ])

  // ── backup_status ────────────────────────────────────────────────────────────
  // Written by backend/backup/backup-db.sh and export-notes.js after each
  // successful run; read by the frontend to show "Last backup: ..." in the
  // sidebar. One row per type ('db' | 'export'), upserted in place — never
  // grown unbounded.
  console.log('Creating "backup_status" collection…')
  await createCollection(
    'backup_status',
    [
      primaryKey(),
      stringField('type', false),
      // Plain writable timestamp (not a 'date-updated' special field) — the
      // backup scripts set this explicitly only when a run actually
      // succeeds, not on every write to the row.
      { field: 'last_success_at', type: 'timestamp', meta: { interface: 'datetime' }, schema: { is_nullable: true } },
      stringField('detail', true),
      // { formatName: directus_files id } — e.g. {"dump": "<uuid>"} for db,
      // {"html": "<uuid>", "pdf": "<uuid>", "docx": "<uuid>"} for export.
      // Lets the frontend download the latest artifact the same way any
      // other file reference works, without a dedicated relation.
      { field: 'files', type: 'json', meta: { interface: 'input-code', options: { language: 'json' } }, schema: { is_nullable: true } },
    ],
    { icon: 'cloud_done' }
  )
  // createCollection only sets fields at creation time — this covers
  // installs where backup_status already existed before `files` was added.
  await createField('backup_status', {
    field: 'files',
    type: 'json',
    meta: { interface: 'input-code', options: { language: 'json' } },
    schema: { is_nullable: true },
  })

  // ── export_requests ──────────────────────────────────────────────────────────
  // A user clicks "Request export" (create, owner-stamped) → export-personal.js
  // (cron, every minute) picks up pending rows, renders that one user's data
  // only, uploads the result tagged with their owner_id, and marks it ready.
  // One row per user at a time — export-personal.js deletes a user's older
  // requests (and their files) once a new one settles, same "current copy
  // only" approach as backup_status.
  console.log('Creating "export_requests" collection…')
  await createCollection(
    'export_requests',
    [
      primaryKey(),
      { ...stringField('status', false, 'pending'), schema: { is_nullable: false, default_value: 'pending' } },
      dateField('requested_at', 'date-created'),
      { field: 'completed_at', type: 'timestamp', meta: { interface: 'datetime' }, schema: { is_nullable: true } },
      stringField('detail', true),
      { field: 'files', type: 'json', meta: { interface: 'input-code', options: { language: 'json' } }, schema: { is_nullable: true } },
    ],
    { icon: 'download' }
  )
  await createField('export_requests', {
    field: 'owner_id',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'] },
    schema: { is_nullable: true },
  })
  await createRelation('export_requests', 'owner_id', 'directus_users', 'SET NULL')

  // ── Relations ────────────────────────────────────────────────────────────────
  console.log('\nCreating relations…')

  await createRelation('pages', 'section_id', 'sections', 'SET NULL')
  await createRelation('notes', 'page_id', 'pages', 'CASCADE')
  // note_files relations — one_field:'files' registers the FK side of the O2M
  await createRelation('note_files', 'note_id', 'notes', 'CASCADE', { one_field: 'files' })
  await createRelation('note_files', 'file_id', 'directus_files', 'SET NULL')

  // Directus 11 requires an explicit directus_fields entry for the virtual O2M alias
  // on the "one" side, even when one_field is set on the relation.
  await createField('notes', {
    field: 'files',
    type: 'alias',
    meta: { special: ['o2m'], interface: 'list-o2m', display: 'related-values', hidden: false },
  })

  // owner_id: the directus_users record that created the row. Nullable so
  // pre-existing rows (and a deleted owner, via SET NULL below) don't break;
  // stamped server-side on create (see each collection's create permission's
  // preset below) rather than trusted from the request body. Same treatment
  // on sections/pages/notes — each owned independently, not inherited down
  // the hierarchy, so e.g. a page's owner doesn't have to match its section's.
  for (const collection of ['sections', 'pages', 'notes']) {
    await createField(collection, {
      field: 'owner_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', special: ['m2o'] },
      schema: { is_nullable: true },
    })
    await createRelation(collection, 'owner_id', 'directus_users', 'SET NULL')
  }

  // directus_files.owner_id: same shape, extended onto the system files
  // collection. ONLY export-personal.js sets this (on a user's own export
  // artifacts) — every regular note attachment (uploaded via uploadFile()
  // in api.js) leaves it null, exactly as before this field existed. That's
  // what makes the read-permission change below additive-safe rather than
  // a regression: existing attachments stay universally readable (null),
  // and only owner-tagged files gain a restriction.
  await createField('directus_files', {
    field: 'owner_id',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'] },
    schema: { is_nullable: true },
  })
  await createRelation('directus_files', 'owner_id', 'directus_users', 'SET NULL')

  // ── Permissions ──────────────────────────────────────────────────────────────
  // In Directus 11, admin_access:true only grants panel access.
  // User-created collections also need explicit CRUD permissions per policy.
  console.log('\nConfiguring permissions…')

  const policiesResp = await req('GET', '/policies?filter[admin_access][_eq]=true&limit=10')
  const policies = policiesResp.data ?? policiesResp
  const userCollections = ['sections', 'pages', 'notes', 'note_files']
  const actions = ['create', 'read', 'update', 'delete']

  for (const policy of policies) {
    for (const collection of userCollections) {
      for (const action of actions) {
        try {
          await req('POST', '/permissions', { policy: policy.id, collection, action, fields: '*' })
          console.log(`  ✓ ${policy.name} → ${collection}:${action}`)
        } catch (e) {
          if (e.message.includes('duplicate') || e.message.includes('Unique constraint') || e.message.includes('already')) {
            console.log(`  ↳ ${collection}:${action} already set`)
          } else {
            throw e
          }
        }
      }
    }
  }

  // backup_status: admin policies get full CRUD (needed for the backup
  // scripts' ADMIN_TOKEN to write it) — kept out of userCollections above
  // since the app-facing policy below only gets read access to this one.
  // Uses upsertPermission (converge-to-one-row), not POST-and-catch —
  // Directus doesn't reject a duplicate (policy, collection, action) row,
  // so the old pattern silently multiplied rows on every re-run instead of
  // skipping.
  for (const policy of policies) {
    for (const action of actions) {
      await upsertPermission(policy.id, 'backup_status', action, { fields: '*' })
    }
  }

  // export_requests: same reasoning — admin policies (ADMIN_TOKEN, used by
  // export-personal.js) get full CRUD; the app policy below gets a much
  // narrower create+read-your-own instead.
  for (const policy of policies) {
    for (const action of actions) {
      await upsertPermission(policy.id, 'export_requests', action, { fields: '*' })
    }
  }

  // ── Scoped asset-reader token ───────────────────────────────────────────────
  // getFileUrl() embeds a token in every <img>/<a> src in the DOM. Using the
  // admin token there means the full admin credential ends up in page HTML,
  // browser history, and disk cache. Provision a dedicated user whose token
  // can only read directus_files, so that's the one exposed to asset URLs.
  console.log('\nSetting up scoped asset-reader token…')

  let assetRole = await findOne('roles', 'name', 'Asset Reader')
  if (!assetRole) {
    assetRole = await req('POST', '/roles', { name: 'Asset Reader', icon: 'image' })
    console.log('  ✓ created role "Asset Reader"')
  } else {
    console.log('  ↳ role "Asset Reader" already exists, skipping')
  }

  let assetPolicy = await findOne('policies', 'name', 'Asset Read-Only')
  if (!assetPolicy) {
    assetPolicy = await req('POST', '/policies', {
      name: 'Asset Read-Only',
      icon: 'image',
      admin_access: false,
      app_access: false,
    })
    console.log('  ✓ created policy "Asset Read-Only"')
    await req('POST', '/permissions', {
      policy: assetPolicy.id,
      collection: 'directus_files',
      action: 'read',
      fields: ['*'],
      permissions: {},
      validation: {},
    })
    console.log('  ✓ granted directus_files:read to "Asset Read-Only"')
  } else {
    console.log('  ↳ policy "Asset Read-Only" already exists, skipping')
  }

  const assetRoleFull = await req('GET', `/roles/${assetRole.id}`)
  if (!assetRoleFull.policies?.length) {
    await req('PATCH', `/roles/${assetRole.id}`, {
      policies: { create: [{ policy: { id: assetPolicy.id } }], update: [], delete: [] },
    })
    console.log('  ✓ linked "Asset Read-Only" policy to "Asset Reader" role')
  } else {
    console.log('  ↳ "Asset Reader" role already has a policy linked, skipping')
  }

  const assetUser = await findOne('users', 'email', 'asset-reader@notecord.app')
  if (!assetUser) {
    await req('POST', '/users', {
      email: 'asset-reader@notecord.app',
      // Random, never used to log in — this account only authenticates via its static token.
      password: crypto.randomUUID(),
      role: assetRole.id,
      status: 'active',
      token: ASSET_TOKEN,
    })
    console.log('  ✓ created "asset-reader" service user with its static token')
  } else {
    console.log('  ↳ "asset-reader" service user already exists, skipping')
  }

  // ── App login role/policy/user ──────────────────────────────────────────────
  // The frontend used to authenticate every request with the admin token — a
  // single shared credential with full Directus admin access baked into the
  // Vite build. This provisions a real login account instead, scoped to only
  // what the app actually does (CRUD on its own collections + file uploads),
  // with no admin_access/app_access so it can never reach the Directus admin app.
  console.log('\nSetting up app login role/policy/user…')

  let appRole = await findOne('roles', 'name', 'NoteCord User')
  if (!appRole) {
    appRole = await req('POST', '/roles', { name: 'NoteCord User', icon: 'person', admin_access: false, app_access: false })
    console.log('  ✓ created role "NoteCord User"')
  } else {
    console.log('  ↳ role "NoteCord User" already exists, skipping')
  }

  let appPolicy = await findOne('policies', 'name', 'NoteCord App Access')
  if (!appPolicy) {
    appPolicy = await req('POST', '/policies', {
      name: 'NoteCord App Access',
      icon: 'person',
      admin_access: false,
      app_access: false,
    })
    console.log('  ✓ created policy "NoteCord App Access"')
  } else {
    console.log('  ↳ policy "NoteCord App Access" already exists, skipping')
  }

  // sections/pages/notes: ownership-scoped by default (owner_id ===
  // $CURRENT_USER), loosened selectively by section_access grants — see
  // notes/notecord-sharing-feature-prompt.md. `create` is stamped
  // server-side via a preset — `fields` deliberately excludes owner_id so a
  // client can't just send its own value in the request body (a preset only
  // fills in a field that's *absent*; it does nothing if the field is
  // writable and submitted).
  //
  // sharedGrant(extra) matches a section_access row granted directly to the
  // current user (on a section or a single page); sharedViaWholeSection
  // matches a page reached through a whole-section grant (page_id: null) on
  // its parent section. Both take an optional role filter so update/delete
  // can require role: 'editor' while read stays open to viewer + editor.
  const sharedGrant = (extra = {}) => ({
    section_access: { user_id: { _eq: '$CURRENT_USER' }, ...extra },
  })
  const sharedViaWholeSection = (extra = {}) => ({
    section_id: { section_access: { user_id: { _eq: '$CURRENT_USER' }, page_id: { _null: true }, ...extra } },
  })
  const editorOnly = { role: { _eq: 'editor' } }

  // ── sections ─────────────────────────────────────────────────────────────
  // Sharing only ever grants visibility into a section's contents, never
  // rename/delete of the section itself — that stays owner-only, full stop.
  await upsertPermission(appPolicy.id, 'sections', 'create', {
    fields: ['id', 'name', 'emoji', 'sort_order'],
    presets: { owner_id: '$CURRENT_USER' },
  })
  await upsertPermission(appPolicy.id, 'sections', 'read', {
    fields: '*',
    permissions: { _or: [{ owner_id: { _eq: '$CURRENT_USER' } }, sharedGrant()] },
  })
  for (const action of ['update', 'delete']) {
    await upsertPermission(appPolicy.id, 'sections', action, {
      fields: '*',
      permissions: { owner_id: { _eq: '$CURRENT_USER' } },
    })
  }

  // ── pages ────────────────────────────────────────────────────────────────
  // read is open to viewer + editor (direct page grant or inherited
  // whole-section grant); update/delete additionally require role: 'editor'.
  await upsertPermission(appPolicy.id, 'pages', 'create', {
    fields: ['id', 'name', 'emoji', 'section_id', 'sort_order'],
    presets: { owner_id: '$CURRENT_USER' },
  })
  // Bug found via the two-account browser smoke test (2026-07-27): an
  // editor can create their own pages/notes within a shared section (per
  // spec), which stamps *their* owner_id on the new row, not the section
  // owner's. Without an explicit "I own the section this belongs to"
  // branch, the section owner had NO permission path back to their own
  // collaborator's content — reading their own section came back empty.
  // This never mattered pre-sharing (every row in your space was always
  // authored by you), so it's a genuinely new failure mode.
  await upsertPermission(appPolicy.id, 'pages', 'read', {
    fields: '*',
    permissions: {
      _or: [
        { owner_id: { _eq: '$CURRENT_USER' } },
        { section_id: { owner_id: { _eq: '$CURRENT_USER' } } },
        sharedGrant(),
        sharedViaWholeSection(),
      ],
    },
  })
  for (const action of ['update', 'delete']) {
    await upsertPermission(appPolicy.id, 'pages', action, {
      fields: '*',
      permissions: {
        _or: [{ owner_id: { _eq: '$CURRENT_USER' } }, sharedGrant(editorOnly), sharedViaWholeSection(editorOnly)],
      },
    })
  }

  // ── notes ────────────────────────────────────────────────────────────────
  // Discord-style ownership, not Google-Docs-style shared editing: viewer
  // AND editor can read/create in a shared page (walking up page_id →
  // section_id to reach section_access), but update/delete stay strictly
  // owner_id-only — a shared editor can edit/delete their *own* notes (which
  // they own via the create preset below) but never anyone else's, no
  // exception. Do not add a section_access branch to update/delete here.
  await upsertPermission(appPolicy.id, 'notes', 'create', {
    fields: ['id', 'page_id', 'content'],
    presets: { owner_id: '$CURRENT_USER' },
    permissions: {
      _or: [
        { owner_id: { _eq: '$CURRENT_USER' } },
        { page_id: sharedGrant() },
        { page_id: sharedViaWholeSection() },
      ],
    },
  })
  await upsertPermission(appPolicy.id, 'notes', 'read', {
    fields: '*',
    permissions: {
      _or: [
        { owner_id: { _eq: '$CURRENT_USER' } },
        // I own the page (or the section it's in) this note lives in — see
        // the pages:read comment above for why this branch exists.
        { page_id: { owner_id: { _eq: '$CURRENT_USER' } } },
        { page_id: { section_id: { owner_id: { _eq: '$CURRENT_USER' } } } },
        { page_id: sharedGrant() },
        { page_id: sharedViaWholeSection() },
      ],
    },
  })
  for (const action of ['update', 'delete']) {
    await upsertPermission(appPolicy.id, 'notes', action, {
      fields: '*',
      permissions: { owner_id: { _eq: '$CURRENT_USER' } },
    })
  }

  // note_files: has no owner_id of its own — ownership is inherited from the
  // parent note via a nested relational filter through note_id.owner_id.
  // `create` stays unscoped (fields:'*', no filter): a client can only ever
  // attach a file to a note it's already allowed to update, and since
  // notes:create presets owner_id to the creator, a shared user's own note
  // already satisfies notes:update — nothing extra to enforce here. `read`
  // extends the same way notes:read does (4 hops: note_id → page_id →
  // section_id → section_access — this is the deepest chain in the feature,
  // verify it actually works before relying on it). `update`/`delete` stay
  // owner_id-only, same Discord-style rule as notes above.
  await upsertPermission(appPolicy.id, 'note_files', 'create', { fields: '*' })
  await upsertPermission(appPolicy.id, 'note_files', 'read', {
    fields: '*',
    permissions: {
      _or: [
        { note_id: { owner_id: { _eq: '$CURRENT_USER' } } },
        // Same owner-of-parent gap as notes:read above, one hop further out.
        { note_id: { page_id: { owner_id: { _eq: '$CURRENT_USER' } } } },
        { note_id: { page_id: { section_id: { owner_id: { _eq: '$CURRENT_USER' } } } } },
        { note_id: { page_id: sharedGrant() } },
        { note_id: { page_id: sharedViaWholeSection() } },
      ],
    },
  })
  for (const action of ['update', 'delete']) {
    await upsertPermission(appPolicy.id, 'note_files', action, {
      fields: '*',
      permissions: { note_id: { owner_id: { _eq: '$CURRENT_USER' } } },
    })
  }

  // directus_users:read — needed so the share modal can search/select a
  // user to grant access to. Scoped to safe fields only: never expose the
  // password hash or other system fields, and no row-level filter (any app
  // user can look another up by name/email to share with).
  await upsertPermission(appPolicy.id, 'directus_users', 'read', {
    fields: ['id', 'first_name', 'last_name', 'email'],
  })

  // section_access: create/delete are owner-of-the-target-section-only (this
  // is how "share" and "unshare" work — no separate revoke endpoint needed).
  // No update permission at all: to change a role, delete and recreate.
  await upsertPermission(appPolicy.id, 'section_access', 'create', {
    fields: ['id', 'section_id', 'page_id', 'user_id', 'role'],
    presets: { granted_by: '$CURRENT_USER' },
    permissions: { section_id: { owner_id: { _eq: '$CURRENT_USER' } } },
  })
  await upsertPermission(appPolicy.id, 'section_access', 'read', {
    fields: '*',
    permissions: {
      _or: [{ user_id: { _eq: '$CURRENT_USER' } }, { section_id: { owner_id: { _eq: '$CURRENT_USER' } } }],
    },
  })
  await upsertPermission(appPolicy.id, 'section_access', 'delete', {
    fields: '*',
    permissions: { section_id: { owner_id: { _eq: '$CURRENT_USER' } } },
  })

  // directus_files:create stays unrestricted (fields:'*', no filter) — note
  // attachments are uploaded this way and never set owner_id.
  await upsertPermission(appPolicy.id, 'directus_files', 'create', { fields: '*' })
  // directus_files:read used to be fully unrestricted too. Now scoped to
  // "no owner (every existing/regular attachment) OR owned by me (my own
  // export-personal.js artifacts)" — additive-safe: every attachment that
  // exists today has owner_id:null and stays exactly as readable as before;
  // the only new restriction applies to owner-tagged personal-export files.
  // This is still load-bearing for existing attachments: FileAttachment.vue
  // / ImageAttachment.vue render filename/size from the `files.file_id.*`
  // nested expansion in getRecentNotes/etc. (api.js), fetched through the
  // caller's own session — not just the static asset token used for the
  // actual image/file bytes.
  await upsertPermission(appPolicy.id, 'directus_files', 'read', {
    fields: '*',
    permissions: { _or: [{ owner_id: { _null: true } }, { owner_id: { _eq: '$CURRENT_USER' } }] },
  })

  // export_requests: a user can create their own (owner stamped via preset,
  // nothing else client-writable — the row starts as {status:'pending'} by
  // schema default) and read only their own. No update/delete — only
  // export-personal.js (ADMIN_TOKEN) transitions status/fills in `files`.
  await upsertPermission(appPolicy.id, 'export_requests', 'create', {
    fields: [],
    presets: { owner_id: '$CURRENT_USER' },
  })
  await upsertPermission(appPolicy.id, 'export_requests', 'read', {
    fields: '*',
    permissions: { owner_id: { _eq: '$CURRENT_USER' } },
  })

  // backup_status used to be granted read-only to every "NoteCord App
  // Access" user (single-user-era assumption). Now that NoteCord is
  // genuinely multi-user, that's an over-broad grant — every user's
  // sections/pages/notes are private via owner_id, but backup_status and
  // the files it references cover the *whole instance*. Revoke it here
  // unconditionally; access is re-granted below to one specific user only,
  // via a policy attached directly to their account.
  //
  // Directus does NOT reject a duplicate (policy, collection, action)
  // permission row — repeated runs of the old "POST and catch duplicate"
  // pattern silently created a new row every time instead of erroring, so
  // this deletes every match, not just one (confirmed multiple stale rows
  // existed here from prior runs — a single findOne+delete left the grant
  // still active via the leftover duplicates).
  const staleBackupPerms = await req(
    'GET',
    `/permissions?filter[policy][_eq]=${appPolicy.id}&filter[collection][_eq]=backup_status&filter[action][_eq]=read&limit=-1`
  )
  const staleBackupPermRows = staleBackupPerms.data ?? staleBackupPerms
  if (staleBackupPermRows.length) {
    for (const row of staleBackupPermRows) {
      await req('DELETE', `/permissions/${row.id}`)
    }
    console.log(`  ✓ revoked backup_status:read from "NoteCord App Access" (${staleBackupPermRows.length} stale row(s) removed, now admin-only, see below)`)
  } else {
    console.log('  ↳ "NoteCord App Access" has no backup_status:read to revoke, skipping')
  }

  const appRoleFull = await req('GET', `/roles/${appRole.id}`)
  if (!appRoleFull.policies?.length) {
    await req('PATCH', `/roles/${appRole.id}`, {
      policies: { create: [{ policy: { id: appPolicy.id } }], update: [], delete: [] },
    })
    console.log('  ✓ linked "NoteCord App Access" policy to "NoteCord User" role')
  } else {
    console.log('  ↳ "NoteCord User" role already has a policy linked, skipping')
  }

  let appUser = await findOne('users', 'email', APP_USER_EMAIL)
  if (!appUser) {
    appUser = await req('POST', '/users', {
      email: APP_USER_EMAIL,
      password: APP_USER_PASSWORD,
      role: appRole.id,
      status: 'active',
    })
    console.log(`  ✓ created app login user "${APP_USER_EMAIL}"`)
  } else {
    console.log(`  ↳ app login user "${APP_USER_EMAIL}" already exists, skipping`)
  }

  // ── Backup access: one specific user only, not the shared app role ──────────
  // pg_dump / export-notes.js operate on the whole instance — every user's
  // data, unfiltered — so backup_status and the files it references must
  // NOT be visible to every "NoteCord User". Directus lets a policy attach
  // directly to a single user, independent of role, which is exactly the
  // tool for "one extra privilege for one specific person": APP_USER_EMAIL
  // (the original account) gets it; everyone else sharing the "NoteCord
  // User" role does not.
  console.log('\nSetting up admin-only backup access…')

  let backupsFolder = await findOne('folders', 'name', 'Backups')
  if (!backupsFolder) {
    backupsFolder = await req('POST', '/folders', { name: 'Backups' })
    console.log('  ✓ created "Backups" folder')
  } else {
    console.log('  ↳ "Backups" folder already exists, skipping')
  }

  let backupAdminPolicy = await findOne('policies', 'name', 'Backup Admin')
  if (!backupAdminPolicy) {
    backupAdminPolicy = await req('POST', '/policies', {
      name: 'Backup Admin',
      icon: 'admin_panel_settings',
      admin_access: false,
      app_access: false,
    })
    console.log('  ✓ created policy "Backup Admin"')
  } else {
    console.log('  ↳ policy "Backup Admin" already exists, skipping')
  }
  // Converges every run (not create-once) since this is exactly the case
  // upsertPermission exists for — the folder filter below needs to reflect
  // backupsFolder.id even if the policy already existed from a prior run.
  await upsertPermission(backupAdminPolicy.id, 'backup_status', 'read', { fields: '*' })
  await upsertPermission(backupAdminPolicy.id, 'directus_files', 'read', {
    fields: '*',
    permissions: { folder: { _eq: backupsFolder.id } },
  })

  const appUserFull = await req('GET', `/users/${appUser.id}?fields=policies.policy.id`)
  const alreadyLinked = (appUserFull.policies ?? []).some((p) => p.policy?.id === backupAdminPolicy.id)
  if (!alreadyLinked) {
    await req('PATCH', `/users/${appUser.id}`, {
      policies: { create: [{ policy: { id: backupAdminPolicy.id } }], update: [], delete: [] },
    })
    console.log(`  ✓ attached "Backup Admin" policy directly to ${APP_USER_EMAIL}`)
  } else {
    console.log(`  ↳ "Backup Admin" policy already attached to ${APP_USER_EMAIL}, skipping`)
  }

  console.log('\n✅ Schema setup complete!\n')
  console.log('Collections created: sections, pages, notes, note_files')
  console.log(`Directus admin: ${BASE}`)
  console.log('\nSet frontend/.env VITE_DIRECTUS_ASSET_TOKEN to the same value as ASSET_TOKEN.')
  console.log(`Log into the app with APP_USER_EMAIL (${APP_USER_EMAIL}) / APP_USER_PASSWORD.`)
}

main().catch((e) => {
  console.error('\n❌ Setup failed:', e.message)
  process.exit(1)
})
