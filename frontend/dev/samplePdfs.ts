import { randomUUID } from "node:crypto";
import { createReadStream, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

const moduleId = "virtual:yixue-sample-pdfs";
const resolvedModuleId = `\0${moduleId}`;

export function samplePdfs(directory: string | undefined): Plugin {
  const prefix = `/__yixue_sample_pdf/${randomUUID()}`;
  const samples = directory
    ? readdirSync(resolve(directory), { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        .map(({ name }, index) => {
          const path = join(resolve(directory), name);
          return {
            id: `sample-pdf-${index + 1}`,
            filename: name,
            path,
            size: statSync(path).size,
          };
        })
    : [];
  const byId = new Map(samples.map((sample) => [sample.id, sample]));

  return {
    name: "yixue-sample-pdfs",
    resolveId: (id) => (id === moduleId ? resolvedModuleId : undefined),
    load(id) {
      if (id !== resolvedModuleId) return;
      const publicSamples = samples.map(({ id, filename, size }) => ({
        id,
        filename,
        size,
        url: `${prefix}/${id}`,
      }));
      return `export default ${JSON.stringify(publicSamples)}`;
    },
    configureServer(server) {
      server.middlewares.use(prefix, (request, response) => {
        if (
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            request.socket.remoteAddress ?? "",
          )
        ) {
          response.writeHead(403).end();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" }).end();
          return;
        }
        const url = new URL(request.url ?? "/", "http://localhost");
        const sample = byId.get(url.pathname.slice(1));
        if (!sample) {
          response.writeHead(404).end();
          return;
        }
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2]
          ? Math.min(Number(range[2]), sample.size - 1)
          : sample.size - 1;
        if (
          request.headers.range &&
          (!range || start > end || start >= sample.size)
        ) {
          response
            .writeHead(416, { "Content-Range": `bytes */${sample.size}` })
            .end();
          return;
        }
        const headers: Record<string, string | number> = {
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Length": end - start + 1,
          "Content-Type": "application/pdf",
          "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(sample.filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
          "X-Content-Type-Options": "nosniff",
        };
        if (range)
          headers["Content-Range"] = `bytes ${start}-${end}/${sample.size}`;
        if (request.method === "HEAD" || !sample.size) {
          response.writeHead(range ? 206 : 200, headers).end();
          return;
        }
        const file = createReadStream(sample.path, { start, end });
        response.on("close", () => file.destroy());
        file.once("error", () => {
          if (response.headersSent) response.destroy();
          else response.writeHead(404).end();
        });
        file.once("open", () => {
          response.writeHead(range ? 206 : 200, headers);
          file.pipe(response);
        });
      });
    },
  };
}
