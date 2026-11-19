CREATE TABLE documents (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, client_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES users(id), recipient_name TEXT NOT NULL, recipient_email TEXT NOT NULL,
 pdf BLOB NOT NULL, pdf_sha256 TEXT NOT NULL, pdf_size INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','signed','declined','void')),
 version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 sent_at TEXT, signed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX documents_recipient ON documents(recipient_id,client_id,status);
CREATE TABLE document_signatures (
 document_id TEXT PRIMARY KEY REFERENCES documents(id),
 manifest TEXT NOT NULL CHECK(json_valid(manifest)), manifest_sha256 TEXT NOT NULL,
 drawing BLOB, created_at TEXT NOT NULL
);
CREATE TABLE document_events (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), actor_id TEXT NOT NULL,
 action TEXT NOT NULL, version INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(document_id,actor_id,action,version)
);
CREATE TRIGGER document_lock_content BEFORE UPDATE ON documents
 WHEN OLD.status!='draft' AND (NEW.title!=OLD.title OR NEW.client_id!=OLD.client_id OR NEW.recipient_id!=OLD.recipient_id OR NEW.recipient_name!=OLD.recipient_name OR NEW.recipient_email!=OLD.recipient_email OR NEW.pdf!=OLD.pdf OR NEW.pdf_sha256!=OLD.pdf_sha256 OR NEW.pdf_size!=OLD.pdf_size)
 BEGIN SELECT RAISE(ABORT,'Document content is locked'); END;
CREATE TRIGGER document_lock_signed BEFORE UPDATE ON documents
 WHEN OLD.status='signed' AND (NEW.status!='signed' OR NEW.signed_at IS NOT OLD.signed_at)
 BEGIN SELECT RAISE(ABORT,'Signed document is immutable'); END;
CREATE TRIGGER document_no_delete BEFORE DELETE ON documents BEGIN SELECT RAISE(ABORT,'Archive documents instead'); END;
CREATE TRIGGER signature_no_update BEFORE UPDATE ON document_signatures BEGIN SELECT RAISE(ABORT,'Signature is immutable'); END;
CREATE TRIGGER signature_no_delete BEFORE DELETE ON document_signatures BEGIN SELECT RAISE(ABORT,'Signature is immutable'); END;
CREATE TRIGGER document_event_no_update BEFORE UPDATE ON document_events BEGIN SELECT RAISE(ABORT,'Event is immutable'); END;
CREATE TRIGGER document_event_no_delete BEFORE DELETE ON document_events BEGIN SELECT RAISE(ABORT,'Event is immutable'); END;
