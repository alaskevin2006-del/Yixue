import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// Local adapter only. Domain code uses read/transaction units and record operations,
// never SQL or DatabaseSync. Both units accept async callbacks for future adapters.
export class SQLiteRepository {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.queue = Promise.resolve();
    try {
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      this.db.exec("BEGIN IMMEDIATE");
      const version = this.db.prepare("PRAGMA user_version").get().user_version;
      if (version === 0) this.db.exec(readFileSync(new URL("schema.sql", import.meta.url), "utf8"));
      else if (version !== 1) throw new Error("Unsupported local schema version.");
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
    const get = (sql, ...args) => {
      const row = this.db.prepare(sql).get(...args);
      return row ? { ...row } : null;
    };
    const all = (sql, ...args) => this.db.prepare(sql).all(...args).map((row) => ({ ...row }));
    const run = (sql, ...args) => this.db.prepare(sql).run(...args);
    this.records = {
      ensurePrincipal: (id, at) => run("INSERT INTO user_principals (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING", id, at),
      findSubject: (id) => get("SELECT * FROM subjects WHERE id=?", id),
      listSubjects: (owner) => all("SELECT * FROM subjects WHERE owner_user_id=? ORDER BY created_at, id", owner),
      insertSubject: (s) => run("INSERT INTO subjects (id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", s.id, s.owner_user_id, s.name, s.created_at, s.updated_at),
      findConversation: (id) => get("SELECT * FROM conversations WHERE id=?", id),
      listConversations: (subjectId) => all("SELECT * FROM conversations WHERE subject_space_id=? AND deleted_at IS NULL ORDER BY updated_at DESC, id", subjectId),
      insertConversation: (c) => run("INSERT INTO conversations (id, subject_space_id, title, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)", c.id, c.subject_space_id, c.title, c.created_at, c.updated_at),
      deleteConversation: (id, at) => run("UPDATE conversations SET deleted_at=?, updated_at=? WHERE id=?", at, at, id),
      touchConversation: (id, at) => run("UPDATE conversations SET updated_at=? WHERE id=?", at, id),
      listMessages: (id) => all("SELECT * FROM messages WHERE conversation_id=? ORDER BY ordinal", id),
      findMessage: (id) => get("SELECT * FROM messages WHERE id=?", id),
      nextOrdinal: (id) => get("SELECT COALESCE(MAX(ordinal), 0)+1 AS ordinal FROM messages WHERE conversation_id=?", id).ordinal,
      insertMessage: (m) => run("INSERT INTO messages (id, conversation_id, role, content, ordinal, created_at) VALUES (?, ?, ?, ?, ?, ?)", m.id, m.conversation_id, m.role, m.content, m.ordinal, m.created_at),
      findRequest: (principal, id, requestId) => get("SELECT * FROM message_requests WHERE principal_id=? AND conversation_id=? AND request_id=?", principal, id, requestId),
      insertRequest: (r) => run("INSERT INTO message_requests (principal_id, conversation_id, request_id, content_sha256, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", r.principal_id, r.conversation_id, r.request_id, r.content_sha256, r.message_id, r.created_at),
    };
  }

  read(work) { return this.operation(work, false); }
  transaction(work) { return this.operation(work, true); }

  operation(work, write) {
    // DatabaseSync owns one connection. Queue entire units so async domain calls
    // cannot interleave inside another request's transaction. SQLite's write lock
    // also serializes independent processes sharing this local development file.
    const result = this.queue.then(async () => {
      this.db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const value = await work(this.records);
        this.db.exec("COMMIT");
        return value;
      } catch (error) {
        if (this.db.isTransaction) this.db.exec("ROLLBACK");
        throw error;
      }
    });
    this.queue = result.catch(() => {});
    return result;
  }

  async close() { await this.queue; this.db.close(); }
}
