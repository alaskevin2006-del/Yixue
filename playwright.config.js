import {defineConfig} from '@playwright/test';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const demoDataDir=process.env.YIXUE_E2E_DATA_DIR??mkdtempSync(join(tmpdir(),'yixue-e2e-'));
export default defineConfig({testDir:'./tests/e2e',testMatch:'connected.spec.js',fullyParallel:true,workers:3,timeout:30000,reporter:'list',use:{baseURL:'http://127.0.0.1:3003',headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined,viewport:{width:1440,height:1000},screenshot:'only-on-failure'},webServer:{command:'node scripts/serve-product-demo.mjs',url:'http://127.0.0.1:3003',env:{YIXUE_DEMO_DATA_DIR:demoDataDir,YIXUE_DEMO_PORT:'3003',YIXUE_DEMO_USERNAME:'prototype-test',YIXUE_DEMO_PASSWORD:'local-test-only-password'},reuseExistingServer:false}});
