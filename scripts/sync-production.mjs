import {copyFileSync,mkdirSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const file of ['index.html','app.js','styles.css'])copyFileSync(join(root,file),join(root,'production',file));
for(const dir of ['client','admin']){mkdirSync(join(root,'production',dir),{recursive:true});for(const file of readdirSync(join(root,dir)))copyFileSync(join(root,dir,file),join(root,'production',dir,file));}
console.log('User and administrator source copies synchronized.');
