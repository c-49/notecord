/**
 * NoteCord — Directus schema setup
 * Run once after `docker compose up -d` to create all collections and fields.
 *
 * Usage:
 *   node backend/setup-schema.js
 *
 * Set DIRECTUS_URL / ADMIN_TOKEN env vars to override defaults.
 */

const BASE = process.env.DIRECTUS_URL ?? 'http://localhost:8055'
const TOKEN = process.env.ADMIN_TOKEN ?? 'notecord-dev-static-token-2026'

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const primaryKey = () => ({
  field: 'id',
  type: 'integer',
  meta: { hidden: true, readonly: true, interface: 'input', special: null },
  schema: { is_primary_key: true, has_auto_increment: true, is_nullable: false },
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
      { field: 'section_id', type: 'integer', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } },
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
      { field: 'page_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', required: true }, schema: { is_nullable: false } },
      textField('content'),
      { ...stringField('attachment_type', false, 'none'), schema: { is_nullable: false, default_value: 'none' } },
      { field: 'attachment_file', type: 'uuid', meta: { interface: 'file' }, schema: { is_nullable: true } },
      stringField('embed_url', true),
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
      { field: 'note_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', required: true }, schema: { is_nullable: false } },
      { field: 'file_id', type: 'uuid', meta: { interface: 'file' }, schema: { is_nullable: true } },
      { ...stringField('attachment_type', false, 'file'), schema: { is_nullable: false, default_value: 'file' } },
      stringField('embed_url', true),
      intField('sort_order', 0),
    ],
    { icon: 'attach_file', sort_field: 'sort_order' }
  )

  // ── Relations ────────────────────────────────────────────────────────────────
  console.log('\nCreating relations…')

  await createRelation('pages', 'section_id', 'sections', 'SET NULL')
  await createRelation('notes', 'page_id', 'pages', 'CASCADE')
  await createRelation('notes', 'attachment_file', 'directus_files', 'SET NULL')
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

  console.log('\n✅ Schema setup complete!\n')
  console.log('Collections created: sections, pages, notes, note_files')
  console.log(`Directus admin: ${BASE}`)
}

main().catch((e) => {
  console.error('\n❌ Setup failed:', e.message)
  process.exit(1)
})
