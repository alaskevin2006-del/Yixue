import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
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

function copyDirectory(source,target){
  mkdirSync(target,{recursive:true});
  for(const entry of readdirSync(source,{withFileTypes:true})){
    const from=join(source,entry.name),to=join(target,entry.name);
    if(entry.isDirectory())copyDirectory(from,to);
    else if(entry.isFile())copyFileSync(from,to);
  }
}
copyDirectory(join(root, 'client'), join(dist, 'client'));
const vendor=join(dist,'vendor');mkdirSync(vendor,{recursive:true});
copyFileSync(join(root,'node_modules/marked/lib/marked.esm.js'),join(vendor,'marked.esm.js'));
copyFileSync(join(root,'node_modules/dompurify/dist/purify.es.mjs'),join(vendor,'purify.es.mjs'));
copyDirectory(join(root,'node_modules/katex/dist'),join(vendor,'katex'));

console.log(`Built ${files.length} files into dist/`);
