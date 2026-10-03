import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Explicit build-file allowlist: never expose the DB, repository, or test fixtures.
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

export async function serveFrontend(req, res, path, root) {
  const file = files.get(path);
  if (!file) { res.writeHead(404).end("Not found"); return; }
  if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405, { allow: "GET, HEAD" }).end(); return; }
  try {
    const body = await readFile(join(root, file[0]));
    res.writeHead(200, { "content-type": file[1], "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch { res.writeHead(503).end("Built frontend unavailable. Run npm run build."); }
}
