CREATE TABLE material_drive_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT NOT NULL
);

CREATE TABLE material_drive_folders (
  client_id TEXT PRIMARY KEY REFERENCES records(id),
  folder_id TEXT NOT NULL UNIQUE
);
