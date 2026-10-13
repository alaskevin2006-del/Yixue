import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      const version=this.get('PRAGMA user_version').user_version;
      if(version>2)throw Error('Unsupported database schema version');
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_principals (id TEXT PRIMARY KEY, created_at TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','admin')), disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL) STRICT;
        CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES user_principals(id), name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'book', created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
        CREATE INDEX IF NOT EXISTS subjects_owner ON subjects(owner_user_id, created_at, id);
        CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, subject_space_id TEXT NOT NULL REFERENCES subjects(id), title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'learning', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT) STRICT;
        CREATE INDEX IF NOT EXISTS conversations_subject ON conversations(subject_space_id, updated_at, id) WHERE deleted_at IS NULL;
        CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal>0), created_at TEXT NOT NULL, UNIQUE(conversation_id,ordinal), UNIQUE(id,conversation_id)) STRICT;
        CREATE TABLE IF NOT EXISTS message_requests (principal_id TEXT NOT NULL REFERENCES user_principals(id), conversation_id TEXT NOT NULL REFERENCES conversations(id), request_id TEXT NOT NULL, content_sha256 TEXT NOT NULL, message_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, PRIMARY KEY(principal_id,conversation_id,request_id), FOREIGN KEY(message_id,conversation_id) REFERENCES messages(id,conversation_id)) STRICT;
        CREATE TABLE IF NOT EXISTS ai_runs (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), user_message_id TEXT NOT NULL REFERENCES messages(id), status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')), assistant_message_id TEXT REFERENCES messages(id), error_code TEXT, error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
        CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_active_message ON ai_runs(user_message_id) WHERE status IN ('queued','running');
        CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_completed_message ON ai_runs(user_message_id) WHERE status='completed';
      `);
      if (!this.all('PRAGMA table_info(subjects)').some(c => c.name === 'icon')) this.db.exec("ALTER TABLE subjects ADD COLUMN icon TEXT NOT NULL DEFAULT 'book'");
      if (!this.all('PRAGMA table_info(conversations)').some(c => c.name === 'kind')) this.db.exec("ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'learning'");
      const definition = this.get("SELECT sql FROM sqlite_master WHERE name='messages'").sql;
      if (!definition.includes("'assistant'")) {
        this.db.exec(`CREATE TABLE messages_upgrade (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal>0), created_at TEXT NOT NULL, UNIQUE(conversation_id,ordinal), UNIQUE(id,conversation_id)) STRICT;
          INSERT INTO messages_upgrade SELECT * FROM messages; DROP TABLE messages; ALTER TABLE messages_upgrade RENAME TO messages;`);
      }
      this.db.exec('PRAGMA user_version=2; COMMIT; PRAGMA foreign_keys=ON');
      if (this.get('PRAGMA foreign_key_check')) throw Error('Database integrity check failed');
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      this.db.close(); throw error;
    }
  }
  get(sql, ...params) { const row = this.db.prepare(sql).get(...params); return row ? { ...row } : null; }
  all(sql, ...params) { return this.db.prepare(sql).all(...params).map(row => ({ ...row })); }
  run(sql, ...params) { return this.db.prepare(sql).run(...params); }
  transaction(fn) {
    if (this.db.isTransaction) throw Error('Nested transactions are unsupported');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      if (result && typeof result.then === 'function') throw Error('Transactions require synchronous callbacks');
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
