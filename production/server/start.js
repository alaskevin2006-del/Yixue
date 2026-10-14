import { readConfig } from "./config.js";
import { SQLiteRepository } from "./db/sqlite.js";
import { createApp } from "./app.js";
import { Store } from './store.js';
import { createAI } from './ai.js';
import { createProductionServer } from './production.js';
import { initResources, handleResources, getReferenceContext } from './resources.js';
import { initContinuity, handleContinuity, getLearningContext, recordAnswerSources } from './continuity.js';
import { pathToFileURL } from 'node:url';

export async function startApplication(config=readConfig(),{ai=createAI(config)}={}) {
  let repository,server;
  if(config.principalMode==='DEV_ONLY'){
    repository=new SQLiteRepository(config.dbPath);
    server=createApp(repository,{staticRoot:config.staticRoot});
  }else{
    repository=new Store(config.dbPath);
    try{
      initResources(repository,config);initContinuity(repository,config);
      server=await createProductionServer(repository,{config,ai,handlers:[handleResources,handleContinuity],contextHooks:{resourceContext:getReferenceContext,learningContext:getLearningContext,recordAnswerSources}});
    }catch(error){repository.close();throw error;}
  }
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, resolve);
    });
  } catch (error) { await repository.close(); throw error; }
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    server.abort?.();
    await new Promise((resolve) => server.close(resolve));
    await server.drain?.();
    await repository.close();
  };
  return{server,store:repository,config,stop};
}

async function main(){
  const config=readConfig();config.logger=entry=>console.log(JSON.stringify(entry));
  const app=await startApplication(config);
  console.log(JSON.stringify({event:'listening',host:config.host,port:app.server.address().port,principalMode:config.principalMode}));
  const stop=()=>{const deadline=setTimeout(()=>process.exit(1),10000).unref();app.stop().then(()=>clearTimeout(deadline)).catch(()=>process.exit(1));};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{
  // Never print request contents, environment values, provider details or secrets.
  const known=['ADMIN_BOOTSTRAP_REQUIRED','DEV_ONLY identity is forbidden in production.','HTTPS YIXUE_ORIGIN is required in production.'];
  console.error(known.includes(error.message)?error.message:'BACKEND_START_FAILED');process.exitCode=1;
});
