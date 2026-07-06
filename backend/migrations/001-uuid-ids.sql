-- Migrate sections/pages/notes/note_files from auto-increment integer PKs to
-- client-generated UUID v4 PKs, backfilling existing rows in place.
-- Postgres can't cast integer -> uuid directly, so this adds shadow uuid
-- columns, backfills them (PK via gen_random_uuid(), FKs via join to the
-- parent's new uuid), then swaps them in for the old integer columns.
--
-- Run via:
--   docker compose exec -T database psql -U directus -d notecord -f - < backend/migrations/001-uuid-ids.sql

BEGIN;

-- ── sections ────────────────────────────────────────────────────────────────
ALTER TABLE sections ADD COLUMN id_new uuid NOT NULL DEFAULT gen_random_uuid();

-- ── pages ───────────────────────────────────────────────────────────────────
ALTER TABLE pages ADD COLUMN id_new uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE pages ADD COLUMN section_id_new uuid;
UPDATE pages SET section_id_new = sections.id_new
  FROM sections WHERE pages.section_id = sections.id;

-- ── notes ───────────────────────────────────────────────────────────────────
ALTER TABLE notes ADD COLUMN id_new uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE notes ADD COLUMN page_id_new uuid;
UPDATE notes SET page_id_new = pages.id_new
  FROM pages WHERE notes.page_id = pages.id;
ALTER TABLE notes ALTER COLUMN page_id_new SET NOT NULL;

-- ── note_files ──────────────────────────────────────────────────────────────
ALTER TABLE note_files ADD COLUMN id_new uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE note_files ADD COLUMN note_id_new uuid;
UPDATE note_files SET note_id_new = notes.id_new
  FROM notes WHERE note_files.note_id = notes.id;
ALTER TABLE note_files ALTER COLUMN note_id_new SET NOT NULL;

-- ── drop old constraints (children first) ──────────────────────────────────
ALTER TABLE note_files DROP CONSTRAINT note_files_note_id_foreign;
ALTER TABLE notes DROP CONSTRAINT notes_page_id_foreign;
ALTER TABLE pages DROP CONSTRAINT pages_section_id_foreign;

ALTER TABLE note_files DROP CONSTRAINT note_files_pkey;
ALTER TABLE notes DROP CONSTRAINT notes_pkey;
ALTER TABLE pages DROP CONSTRAINT pages_pkey;
ALTER TABLE sections DROP CONSTRAINT sections_pkey;

-- ── drop old integer columns ────────────────────────────────────────────────
ALTER TABLE note_files DROP COLUMN note_id;
ALTER TABLE notes DROP COLUMN page_id;
ALTER TABLE pages DROP COLUMN section_id;

ALTER TABLE sections DROP COLUMN id;
ALTER TABLE pages DROP COLUMN id;
ALTER TABLE notes DROP COLUMN id;
ALTER TABLE note_files DROP COLUMN id;

-- ── rename new columns into place ───────────────────────────────────────────
ALTER TABLE sections RENAME COLUMN id_new TO id;
ALTER TABLE pages RENAME COLUMN id_new TO id;
ALTER TABLE pages RENAME COLUMN section_id_new TO section_id;
ALTER TABLE notes RENAME COLUMN id_new TO id;
ALTER TABLE notes RENAME COLUMN page_id_new TO page_id;
ALTER TABLE note_files RENAME COLUMN id_new TO id;
ALTER TABLE note_files RENAME COLUMN note_id_new TO note_id;

-- ── re-add PK constraints ───────────────────────────────────────────────────
ALTER TABLE sections ADD CONSTRAINT sections_pkey PRIMARY KEY (id);
ALTER TABLE pages ADD CONSTRAINT pages_pkey PRIMARY KEY (id);
ALTER TABLE notes ADD CONSTRAINT notes_pkey PRIMARY KEY (id);
ALTER TABLE note_files ADD CONSTRAINT note_files_pkey PRIMARY KEY (id);

-- ── re-add FK constraints (same ON DELETE rules as before) ──────────────────
ALTER TABLE pages ADD CONSTRAINT pages_section_id_foreign
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE notes ADD CONSTRAINT notes_page_id_foreign
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE;
ALTER TABLE note_files ADD CONSTRAINT note_files_note_id_foreign
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE;

-- ── drop orphaned sequences ──────────────────────────────────────────────────
DROP SEQUENCE IF EXISTS sections_id_seq;
DROP SEQUENCE IF EXISTS pages_id_seq;
DROP SEQUENCE IF EXISTS notes_id_seq;
DROP SEQUENCE IF EXISTS note_files_id_seq;

COMMIT;
