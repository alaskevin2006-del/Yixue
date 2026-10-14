import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const port=Number(process.env.YIXUE_DEMO_PORT??3001);
const root=new URL('../dist/',import.meta.url);
const files=new Map([['/','index.html'],...['index.html','app.js','styles.css','version.json'].map(f=>['/'+f,f]),...['model.js','storage.js','fixtures.js','views.js','main.js'].map(f=>['/client/'+f,'client/'+f])]);
const types={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json'};
const server=createServer(async(req,res)=>{
 const file=files.get(new URL(req.url,'http://localhost').pathname);
 if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end('Not found');return;}
 try{const body=await readFile(fileURLToPath(new URL(file,root)));res.writeHead(200,{'content-type':types[file.split('.').at(-1)]+'; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(503).end('Run npm run build first');}
});
server.listen(port,'127.0.0.1',()=>console.log(`User prototype: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
