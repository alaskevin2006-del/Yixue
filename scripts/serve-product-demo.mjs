import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Explicit, separate loopback-only demo surface. No backend, DB, or /api fallback.
if (process.env.NODE_ENV === 'production') throw new Error('PRODUCT_DEMO_DEV_ONLY: production launch is disabled');
const port = Number(process.env.YIXUE_DEMO_PORT ?? 3001);
const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['dist/index.html', 'text/html']], ['/index.html', ['dist/index.html', 'text/html']],
  ['/app.js', ['dist/app.js', 'text/javascript']], ['/styles.css', ['dist/styles.css', 'text/css']],
  ...['workspace.js', 'data-source.js', 'scenario.js', 'product.css'].map(name => [`/demo/${name}`, [`demo/${name}`, name.endsWith('.css') ? 'text/css' : 'text/javascript']]),
]);
const server = createServer(async (request, response) => {
  const entry = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!entry || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end('PRODUCT_DEMO_ROUTE_NOT_FOUND'); return; }
  try {
    let content = await readFile(fileURLToPath(new URL(entry[0], root)));
    if (entry[1] === 'text/html') content = Buffer.from(content.toString().replace('<html lang="zh-CN">', '<html lang="zh-CN" data-product-demo="true">').replace('</head>', '<link rel="stylesheet" href="/demo/product.css" /></head>'));
    response.writeHead(200, { 'content-type': `${entry[1]}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500); response.end('DEMO_BUILD_MISSING: run npm run build'); }
});
server.listen(port, '127.0.0.1', () => console.log(`PRODUCT DEMO (session fixtures only): http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
