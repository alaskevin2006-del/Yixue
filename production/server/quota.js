import {statfsSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {HttpError} from './errors.js';
import {storageRoot} from './resource-files.js';
const reservations=new WeakMap();
// Admission is synchronous until reservation is recorded: concurrent writes cannot
// both consume the last available bytes. Physical disk usage includes orphans.
export async function withUploadQuota(store,config,user,size,work){
 if(!Number.isSafeInteger(size)||size<0)throw new HttpError(400,'INVALID_SIZE','文件大小无效');
 let held=reservations.get(store);if(!held){held=new Map();reservations.set(store,held);}
 const mine=held.get(user.id)||0,totalHeld=[...held.values()].reduce((a,b)=>a+b,0);
 const used=store.get(`SELECT COALESCE(SUM(size),0) AS n FROM (SELECT size FROM resources WHERE owner_user_id=? AND storage_key IS NOT NULL UNION ALL SELECT size FROM resource_submissions WHERE owner_user_id=? AND storage_key IS NOT NULL AND deleted_at IS NULL)`,user.id,user.id).n;
 if(used+mine+size>(config.userQuotaBytes??1024**3))throw new HttpError(413,'USER_QUOTA_EXCEEDED','账号文件容量已达上限，请清理不需要的文件或联系管理员。');
 const root=storageRoot(config);let diskBytes=0;
 for(const key of readdirSync(root)){if(/^[a-f0-9-]{36}\.blob$/.test(key))diskBytes+=statSync(join(root,key)).size;}
 if(diskBytes+totalHeld+size>(config.totalStorageBytes??20*1024**3))throw new HttpError(507,'STORAGE_QUOTA_EXCEEDED','资料存储容量不足，请联系管理员。');
 const disk=statfsSync(root);const free=Number(disk.bavail)*Number(disk.bsize);
 if(free-totalHeld-size<(config.minFreeDiskBytes??512*1024**2))throw new HttpError(507,'DISK_SPACE_LOW','服务器磁盘空间不足，文件尚未保存。');
 held.set(user.id,mine+size);
 try{return await work();}finally{const remaining=(held.get(user.id)||0)-size;if(remaining>0)held.set(user.id,remaining);else held.delete(user.id);}
}
