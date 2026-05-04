-- ============================================================================
-- BREAK MEMORY — SCHEMA
-- ============================================================================
-- Idempotent: safe to run multiple times.
-- Creates schema break_memory with 7 tables + updated_at trigger function.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS break_memory;
SET search_path TO break_memory, public;

-- ----------------------------------------------------------------------------
-- TABLE 1: identity
-- key is UNIQUE natural key; id serial is the PK.
-- INSERTs use ON CONFLICT (key) DO UPDATE.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(60) UNIQUE NOT NULL,
  content     TEXT NOT NULL,
  priority    INT NOT NULL DEFAULT 5,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_identity_priority ON identity(priority);

-- ----------------------------------------------------------------------------
-- TABLE 2: relationships
-- (entity, aspect) is the natural key.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relationships (
  id          SERIAL PRIMARY KEY,
  entity      VARCHAR(40) NOT NULL,
  aspect      VARCHAR(60) NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity, aspect)
);
CREATE INDEX IF NOT EXISTS idx_relationships_entity ON relationships(entity);

-- ----------------------------------------------------------------------------
-- TABLE 3: lessons
-- severity is TEXT + CHECK rather than ENUM so we can add levels without
-- migrating the type later.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lessons (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(120) NOT NULL,
  context     TEXT NOT NULL,
  lesson      TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('critical','important','note')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lessons_severity ON lessons(severity);

-- ----------------------------------------------------------------------------
-- TABLE 4: decisions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decisions (
  id              SERIAL PRIMARY KEY,
  decision_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  title           VARCHAR(160) NOT NULL,
  decision_text   TEXT NOT NULL,
  rationale       TEXT NOT NULL,
  decided_by      VARCHAR(40) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','superseded','reverted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_date ON decisions(decision_date DESC);

-- ----------------------------------------------------------------------------
-- TABLE 5: technical_notes
-- category stays as VARCHAR (not CHECK) so we can extend categories without
-- a migration. Current values: endpoint, config, bug, command.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS technical_notes (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(40) NOT NULL,
  title       VARCHAR(160) NOT NULL,
  content     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tech_notes_category ON technical_notes(category);
CREATE INDEX IF NOT EXISTS idx_tech_notes_active ON technical_notes(is_active);

-- ----------------------------------------------------------------------------
-- TABLE 6: session_snapshots
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_snapshots (
  id              SERIAL PRIMARY KEY,
  session_date    DATE NOT NULL,
  summary         TEXT NOT NULL,
  key_events      TEXT,
  pending         TEXT,
  emotional_notes TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON session_snapshots(session_date DESC);

-- ----------------------------------------------------------------------------
-- TABLE 7: free_memory
-- Truly free-form scratchpad. tags is a CSV string. No CHECK, no ENUM.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS free_memory (
  id          SERIAL PRIMARY KEY,
  tags        VARCHAR(200),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_free_tags ON free_memory(tags);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_identity_updated ON identity;
CREATE TRIGGER trg_identity_updated
  BEFORE UPDATE ON identity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_relationships_updated ON relationships;
CREATE TRIGGER trg_relationships_updated
  BEFORE UPDATE ON relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_tech_notes_updated ON technical_notes;
CREATE TRIGGER trg_tech_notes_updated
  BEFORE UPDATE ON technical_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Search uses simple ILIKE for now. Migrate to pg_trgm + GIN when content
-- crosses ~10K rows total. Adding the extension prematurely is unnecessary
-- complexity.
