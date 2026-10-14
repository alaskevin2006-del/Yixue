import {randomUUID} from 'node:crypto';
export function initAudit(store){store.db.exec(`CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,created_at TEXT NOT NULL) STRICT; CREATE INDEX IF NOT EXISTS audit_created ON admin_audit(created_at);`);}
export function audit(store,user,action,type,id){store.run('INSERT INTO admin_audit VALUES(?,?,?,?,?,?)',randomUUID(),user.id,action,type,id,new Date().toISOString());}
