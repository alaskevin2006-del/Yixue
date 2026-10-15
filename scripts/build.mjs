import { copyFileSync, existsSync, mkdirSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const files = ["index.html", "styles.css", "app.js"];

if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
}

mkdirSync(dist, { recursive: true });

for (const file of files) {
  copyFileSync(join(root, file), join(dist, file));
}

for (const folder of ['client', 'legacy','admin']) {
  mkdirSync(join(dist, folder), { recursive: true });
  for (const file of readdirSync(join(root, folder))) copyFileSync(join(root, folder, file), join(dist, folder, file));
}
let revision = 'uncommitted';
mkdirSync(join(dist,'vendor'),{recursive:true});
for(const name of ['pdf.mjs','pdf.worker.mjs'])copyFileSync(join(root,'production/node_modules/pdfjs-dist/build',name),join(dist,'vendor',name));
try { revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
writeFileSync(join(dist, 'version.json'), JSON.stringify({ revision, builtAt: new Date().toISOString(), mode: 'connected-service' }));

console.log('Built user prototype, client modules, version and preserved local frontend into dist/');
