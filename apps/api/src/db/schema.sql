-- SPDS G2.1 core persistence (+ additive stubs for v1.2 tables)

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  semantic_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (semantic_id)
);

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id),
  name TEXT NOT NULL,
  head_hash TEXT NOT NULL,
  head_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, name)
);

CREATE TABLE IF NOT EXISTS semantic_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_id TEXT NOT NULL,
  model_id UUID NOT NULL REFERENCES models(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  kind TEXT NOT NULL,
  semantic_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (model_id, branch_id, semantic_id)
);

CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_id TEXT NOT NULL,
  model_id UUID NOT NULL REFERENCES models(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  relation_type TEXT NOT NULL,
  from_semantic_id TEXT NOT NULL,
  to_semantic_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, branch_id, semantic_id)
);

CREATE TABLE IF NOT EXISTS parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_id TEXT NOT NULL,
  model_id UUID NOT NULL REFERENCES models(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, branch_id, semantic_id)
);

CREATE TABLE IF NOT EXISTS change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  command TEXT NOT NULL,
  target_ids JSONB NOT NULL DEFAULT '[]',
  before_hash TEXT NOT NULL,
  after_hash TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  invalidation_set JSONB NOT NULL DEFAULT '[]',
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  name TEXT,
  state_hash TEXT NOT NULL,
  state JSONB NOT NULL,
  schema_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- v1.2 additive stubs (wired in later phases)
CREATE TABLE IF NOT EXISTS design_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  expected_head_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifact_objects (
  hash TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  storage_location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coordinate_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id),
  semantic_id TEXT NOT NULL,
  role TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, semantic_id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_objects_model_branch ON semantic_objects(model_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_change_events_branch ON change_events(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_branch ON snapshots(branch_id, created_at);
