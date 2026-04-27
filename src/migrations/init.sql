-- Content Broadcasting System — Database Schema
-- PostgreSQL 16+

BEGIN;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('principal', 'teacher');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_status') THEN
    CREATE TYPE content_status AS ENUM ('uploaded', 'pending', 'approved', 'rejected');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allowed_file_type') THEN
    CREATE TYPE allowed_file_type AS ENUM ('jpg', 'jpeg', 'png', 'gif');
  END IF;
END
$$;

-- ─────────────────────────────────────────────
-- TABLE: users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(120)    NOT NULL,
  email           VARCHAR(255)    NOT NULL UNIQUE,
  password_hash   TEXT            NOT NULL,
  role            user_role       NOT NULL,
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ─────────────────────────────────────────────
-- TABLE: content
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(255)    NOT NULL,
  description      TEXT,
  subject          VARCHAR(100)    NOT NULL,
  file_path        TEXT            NOT NULL,
  file_url         TEXT            NOT NULL,
  file_type        allowed_file_type NOT NULL,
  file_size        BIGINT          NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  original_name    VARCHAR(255)    NOT NULL,
  uploaded_by      UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           content_status  NOT NULL DEFAULT 'uploaded',
  rejection_reason TEXT,
  approved_by      UUID            REFERENCES users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  start_time       TIMESTAMPTZ,
  end_time         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_approval_requires_approver
    CHECK (
      (status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
      OR status != 'approved'
    ),
  CONSTRAINT chk_rejection_requires_reason
    CHECK (
      (status = 'rejected' AND rejection_reason IS NOT NULL AND rejection_reason != '')
      OR status != 'rejected'
    ),
  CONSTRAINT chk_time_window_valid
    CHECK (
      (start_time IS NULL AND end_time IS NULL)
      OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

CREATE INDEX IF NOT EXISTS idx_content_uploaded_by  ON content(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_content_status        ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_subject       ON content(subject);
CREATE INDEX IF NOT EXISTS idx_content_status_uploader ON content(status, uploaded_by);
CREATE INDEX IF NOT EXISTS idx_content_active_window ON content(status, start_time, end_time)
  WHERE status = 'approved';

-- ─────────────────────────────────────────────
-- TABLE: content_slots (subject-based broadcast buckets)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (teacher_id, subject)
);

CREATE INDEX IF NOT EXISTS idx_slots_teacher_subject ON content_slots(teacher_id, subject);

-- ─────────────────────────────────────────────
-- TABLE: content_schedules
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id      UUID        NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  slot_id         UUID        NOT NULL REFERENCES content_slots(id) ON DELETE CASCADE,
  rotation_order  INTEGER     NOT NULL CHECK (rotation_order >= 0),
  duration        INTEGER     NOT NULL CHECK (duration > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (slot_id, rotation_order),
  UNIQUE (content_id, slot_id)
);

CREATE INDEX IF NOT EXISTS idx_schedules_slot_id    ON content_schedules(slot_id);
CREATE INDEX IF NOT EXISTS idx_schedules_content_id ON content_schedules(content_id);

-- ─────────────────────────────────────────────
-- TRIGGER: auto-update updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_content_updated_at') THEN
    CREATE TRIGGER trg_content_updated_at
      BEFORE UPDATE ON content
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_schedules_updated_at') THEN
    CREATE TRIGGER trg_schedules_updated_at
      BEFORE UPDATE ON content_schedules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END
$$;

COMMIT;
