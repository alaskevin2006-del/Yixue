import { readFile, realpath } from "node:fs/promises";
import { join, relative, extname, isAbsolute } from "node:path";

// Explicit build-file allowlist: never expose the DB, repository, or test fixtures.
const files = new Map([
  ["/version.json", ["version.json", "application/json; charset=utf-8"]],
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/admin/", ["admin/index.html", "text/html; charset=utf-8"]],
  ["/admin/index.html", ["admin/index.html", "text/html; charset=utf-8"]],
]);

export async function serveFrontend(req, res, path, root) {
  if(path==='/admin'){res.writeHead(302,{location:'admin/'}).end();return;}
  let decoded;
  try { decoded = decodeURIComponent(path.split('?')[0]); } catch { res.writeHead(404).end('Not found'); return; }
  if(decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part=>part==='..'||part.startsWith('.'))) { res.writeHead(404).end('Not found'); return; }
  const assetTypes = {'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
  const extension=extname(decoded);
  const asset = /^\/(client|vendor|admin)\/[a-zA-Z0-9_./-]+$/.test(decoded) && assetTypes[extension];
  const file = files.get(decoded) ?? (asset ? [decoded.slice(1),asset] : null);
  if (!file) { res.writeHead(404).end("Not found"); return; }
  if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405, { allow: "GET, HEAD" }).end(); return; }
  try {
    const realRoot=await realpath(root), target=await realpath(join(realRoot,file[0]));
    const rel=relative(realRoot,target);
    if(rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(404).end('Not found'); return; }
    const body = await readFile(target);
    res.writeHead(200, { "content-type": file[1], "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' blob:; object-src 'none'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch { res.writeHead(asset ? 404 : 503).end(asset ? 'Not found' : "Built frontend unavailable. Run npm run build."); }
}
