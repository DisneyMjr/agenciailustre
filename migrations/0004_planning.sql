CREATE TABLE meeting_slots (
 id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX meeting_slot_times ON meeting_slots(archived,starts_at,ends_at);
CREATE TABLE meetings (
 id TEXT PRIMARY KEY, slot_id TEXT NOT NULL REFERENCES meeting_slots(id),
 name TEXT NOT NULL, email TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 client_id TEXT, status TEXT NOT NULL CHECK(status IN ('pending','confirmed','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX one_active_meeting_per_slot ON meetings(slot_id) WHERE status IN ('pending','confirmed');
CREATE INDEX meetings_client ON meetings(client_id,status);
CREATE TABLE editorial (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL, title TEXT NOT NULL,
 caption TEXT NOT NULL DEFAULT '', channel TEXT NOT NULL, scheduled_at TEXT NOT NULL,
 asset_url TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('draft','review','approved','changes','published')),
 version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX editorial_calendar ON editorial(archived,scheduled_at,client_id);
CREATE TABLE editorial_reviews (
 id TEXT PRIMARY KEY, editorial_id TEXT NOT NULL REFERENCES editorial(id),
 user_id TEXT NOT NULL, decision TEXT NOT NULL, comment TEXT NOT NULL,
 version INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
