-- Runs once on first container start (docker-entrypoint-initdb.d).
-- pgvector is enabled up front so Stage E can add embedding columns without an infra change.
CREATE EXTENSION IF NOT EXISTS vector;
