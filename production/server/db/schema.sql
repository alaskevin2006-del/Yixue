CREATE TABLE user_principals (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES user_principals(id),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX subjects_owner ON subjects(owner_user_id, created_at, id);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  subject_space_id TEXT NOT NULL REFERENCES subjects(id),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
CREATE INDEX conversations_subject ON conversations(subject_space_id, updated_at, id) WHERE deleted_at IS NULL;

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role = 'user'),
  content TEXT NOT NULL CHECK (length(content) > 0),
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, ordinal),
  UNIQUE (id, conversation_id)
) STRICT;

CREATE TABLE message_requests (
  principal_id TEXT NOT NULL REFERENCES user_principals(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  request_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (principal_id, conversation_id, request_id),
  FOREIGN KEY (message_id, conversation_id) REFERENCES messages(id, conversation_id)
) STRICT;

PRAGMA user_version = 1;
