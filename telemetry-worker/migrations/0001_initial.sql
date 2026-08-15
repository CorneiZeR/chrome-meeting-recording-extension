PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS telemetry_batches (
  batch_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  flush_reason TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  release_version TEXT NOT NULL,
  build_id TEXT NOT NULL,
  browser_target TEXT NOT NULL,
  browser_family TEXT NOT NULL,
  browser_major TEXT NOT NULL,
  os_family TEXT NOT NULL,
  os_major TEXT NOT NULL,
  storage_mode TEXT NOT NULL,
  runtime_json TEXT NOT NULL,
  recording_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ingest_token TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_batches_received ON telemetry_batches(received_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_batches_release ON telemetry_batches(release_version, received_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_batches_run ON telemetry_batches(run_id, started_at);

CREATE TABLE IF NOT EXISTS telemetry_incidents (
  incident_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES telemetry_batches(batch_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  stage TEXT NOT NULL,
  severity TEXT NOT NULL,
  happened_at INTEGER NOT NULL,
  duration_ms REAL,
  error_name TEXT,
  error_fingerprint TEXT,
  context_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_kind ON telemetry_incidents(kind, happened_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_batch ON telemetry_incidents(batch_id);
