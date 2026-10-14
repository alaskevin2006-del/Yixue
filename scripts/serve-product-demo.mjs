import {Store} from '../production/server/store.js';
import {createProductionServer} from '../production/server/production.js';
import {fileURLToPath} from 'node:url';
const port=Number(process.env.YIXUE_DEMO_PORT??3001);
if(!process.env.YIXUE_DEMO_PASSWORD)throw new Error('Set YIXUE_DEMO_USERNAME and YIXUE_DEMO_PASSWORD for the local login demo.');
const store=new Store(':memory:');
const server=await createProductionServer(store,{config:{staticRoot:fileURLToPath(new URL('../dist/',import.meta.url)),adminUsername:process.env.YIXUE_DEMO_USERNAME??'demo',adminPassword:process.env.YIXUE_DEMO_PASSWORD,secureCookies:false}});
server.listen(port,'127.0.0.1',()=>console.log(`Local login prototype: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
