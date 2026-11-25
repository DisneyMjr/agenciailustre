CREATE TABLE project_art_uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES records(id),
  client_id TEXT NOT NULL REFERENCES records(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX project_art_uploads_age ON project_art_uploads(created_at);
