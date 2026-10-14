import { createServer } from "node:http";
import { HttpError } from "./errors.js";
import { ConversationService, requirePrincipal } from "./domain.js";
import { serveFrontend } from "./static.js";

function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(data === undefined ? undefined : JSON.stringify(data));
}

async function readJson(req) {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 65536) chunks.push(chunk);
  }
  if (size > 65536) throw new HttpError(413, "BODY_TOO_LARGE", "JSON body exceeds 64 KiB.");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new HttpError(400, "MALFORMED_JSON", "Malformed JSON body."); }
}

function objectId(encoded) {
  try { return decodeURIComponent(encoded); }
  catch { throw new HttpError(400, "INVALID_INPUT", "Malformed object ID."); }
}

export function createApp(repository, { staticRoot = null } = {}) {
  const service = new ConversationService(repository);
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://127.0.0.1").pathname;
      if (staticRoot && !path.startsWith("/api/")) {
        await serveFrontend(req, res, path, staticRoot);
        return;
      }
      if (path === "/api/health" && req.method === "GET") {
        json(res, 200, { status: "ok", principalMode: "DEV_ONLY", persistence: "LOCAL_SQLITE", model: "NOT_CONFIGURED" });
        return;
      }
      const principal = requirePrincipal(req.headers["x-yixue-dev-user"]);
      if (path === "/api/subjects") {
        if (req.method === "GET") { json(res, 200, { subjects: await service.listSubjects(principal) }); return; }
        if (req.method === "POST") { json(res, 201, { subject: await service.createSubject(principal, await readJson(req)) }); return; }
      }
      const subjectRoute = path.match(/^\/api\/subjects\/([^/]+)\/conversations$/);
      if (subjectRoute) {
        const id = objectId(subjectRoute[1]);
        if (req.method === "GET") { json(res, 200, { conversations: await service.listConversations(principal, id) }); return; }
        if (req.method === "POST") { json(res, 201, { conversation: await service.createConversation(principal, id, await readJson(req)) }); return; }
      }
      const conversationRoute = path.match(/^\/api\/conversations\/([^/]+)$/);
      if (conversationRoute) {
        const id = objectId(conversationRoute[1]);
        if (req.method === "GET") { json(res, 200, { conversation: await service.getConversation(principal, id) }); return; }
        if (req.method === "DELETE") { await service.deleteConversation(principal, id); json(res, 204); return; }
      }
      const messagesRoute = path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
      if (messagesRoute) {
        const id = objectId(messagesRoute[1]);
        if (req.method === "GET") { json(res, 200, { messages: await service.listMessages(principal, id) }); return; }
        if (req.method === "POST") {
          const result = await service.appendUserMessage(principal, id, await readJson(req));
          json(res, result.replayed ? 200 : 201, result);
          return;
        }
      }
      throw new HttpError(path === "/api/subjects" || subjectRoute || conversationRoute || messagesRoute ? 405 : 404,
        path === "/api/subjects" || subjectRoute || conversationRoute || messagesRoute ? "METHOD_NOT_ALLOWED" : "ROUTE_NOT_FOUND", "No supported route for this request.");
    } catch (error) {
      req.resume();
      if (res.destroyed) return;
      const sqlite = error.code?.startsWith("ERR_SQLITE");
      const busy = sqlite && [5, 6].includes(error.errcode);
      const status = error instanceof HttpError ? error.status : busy ? 503 : 500;
      const code = error instanceof HttpError ? error.code : busy ? "PERSISTENCE_BUSY" : sqlite ? "PERSISTENCE_ERROR" : "INTERNAL_ERROR";
      json(res, status, { error: { code, message: error instanceof HttpError ? error.message : "Local operation did not complete." } });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
