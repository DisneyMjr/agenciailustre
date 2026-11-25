CREATE TABLE project_art_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES records(id),
  client_id TEXT NOT NULL REFERENCES records(id),
  number INTEGER NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decision TEXT CHECK(decision IN ('approve', 'changes')),
  comment TEXT,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  UNIQUE(project_id, number)
);
CREATE TABLE project_art_files (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES project_art_versions(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  content BLOB NOT NULL
);
CREATE INDEX project_art_files_version ON project_art_files(version_id);

CREATE TABLE project_art_mail (
  version_id TEXT NOT NULL REFERENCES project_art_versions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_try INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(version_id, user_id)
);
CREATE INDEX project_art_mail_due ON project_art_mail(state, next_try);

CREATE TRIGGER project_art_update_project
AFTER UPDATE OF decision ON project_art_versions
WHEN OLD.decision IS NULL AND NEW.decision IS NOT NULL
BEGIN
  UPDATE records SET data=json_patch(data, json_object(
    'status', CASE NEW.decision WHEN 'approve' THEN 'Concluído' ELSE 'Em andamento' END,
    'approval_decision', NEW.decision, 'approval_comment', NEW.comment,
    'approval_by', NEW.decided_by, 'approval_at', NEW.decided_at
  )), updated_at=CURRENT_TIMESTAMP WHERE id=NEW.project_id;
END;
