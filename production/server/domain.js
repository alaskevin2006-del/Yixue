import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";

export function requirePrincipal(id) {
  if (id === undefined) throw new HttpError(401, "DEV_PRINCIPAL_REQUIRED", "DEV_ONLY principal header is required.");
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new HttpError(400, "INVALID_DEV_PRINCIPAL", "Invalid DEV_ONLY principal identity.");
  }
  return id;
}

function fields(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, "INVALID_INPUT", "Expected a JSON object with only supported fields.");
  }
}

function label(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || !value.isWellFormed() || value.includes("\0")) {
    throw new HttpError(400, "INVALID_INPUT", "Name/title must contain 1–256 characters.");
  }
  return value.trim();
}

async function ownedSubject(records, principal, id) {
  const subject = await records.findSubject(id);
  if (!subject) throw new HttpError(404, "SUBJECT_NOT_FOUND", "Subject Space not found.");
  if (subject.owner_user_id !== principal) throw new HttpError(403, "OBJECT_FORBIDDEN", "Object belongs to another principal.");
  return subject;
}

async function ownedConversation(records, principal, id) {
  const conversation = await records.findConversation(id);
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  await ownedSubject(records, principal, conversation.subject_space_id);
  if (conversation.deleted_at !== null) throw new HttpError(404, "CONVERSATION_DELETED", "Conversation has been deleted.");
  return conversation;
}

// Product rules live here, separately from HTTP and the local SQLite adapter.
export class ConversationService {
  constructor(repository) { this.repository = repository; }

  run(principal, write, work) {
    requirePrincipal(principal);
    return write ? this.repository.transaction(work) : this.repository.read(work);
  }

  listSubjects(principal) {
    return this.run(principal, false, (records) => records.listSubjects(principal));
  }

  createSubject(principal, input) {
    return this.run(principal, true, async (records) => {
      fields(input, ["name"]);
      const name = label(input.name);
      const at = new Date().toISOString();
      const subject = { id: randomUUID(), owner_user_id: principal, name, created_at: at, updated_at: at };
      await records.ensurePrincipal(principal, at);
      await records.insertSubject(subject);
      return subject;
    });
  }

  listConversations(principal, subjectId) {
    return this.run(principal, false, async (records) => {
      await ownedSubject(records, principal, subjectId);
      return records.listConversations(subjectId);
    });
  }

  createConversation(principal, subjectId, input) {
    return this.run(principal, true, async (records) => {
      await ownedSubject(records, principal, subjectId);
      fields(input, ["title"]);
      const title = label(input.title === undefined ? "新对话" : input.title);
      const at = new Date().toISOString();
      const conversation = { id: randomUUID(), subject_space_id: subjectId, title, created_at: at, updated_at: at, deleted_at: null };
      await records.insertConversation(conversation);
      return conversation;
    });
  }

  getConversation(principal, id) {
    return this.run(principal, false, (records) => ownedConversation(records, principal, id));
  }

  deleteConversation(principal, id) {
    return this.run(principal, true, async (records) => {
      await ownedConversation(records, principal, id);
      await records.deleteConversation(id, new Date().toISOString());
    });
  }

  listMessages(principal, id) {
    return this.run(principal, false, async (records) => {
      await ownedConversation(records, principal, id);
      return records.listMessages(id);
    });
  }

  appendUserMessage(principal, id, input) {
    return this.run(principal, true, async (records) => {
      // Authorization/deletion checks precede even a previously successful replay.
      await ownedConversation(records, principal, id);
      fields(input, ["content", "requestId", "role"]);
      if (Object.hasOwn(input, "role") && input.role !== "user") {
        throw new HttpError(400, "ROLE_NOT_ALLOWED", "Only user messages may be submitted.");
      }
      if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 20000 || !input.content.isWellFormed() || input.content.includes("\0")) {
        throw new HttpError(400, "INVALID_MESSAGE", "Content must be nonblank Unicode text of 1–20000 characters, without NUL.");
      }
      if (typeof input.requestId !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.requestId)) {
        throw new HttpError(400, "INVALID_REQUEST_ID", "A valid client requestId is required.");
      }
      const hash = createHash("sha256").update(input.content, "utf8").digest("hex");
      const previous = await records.findRequest(principal, id, input.requestId);
      if (previous) {
        if (previous.content_sha256 !== hash) throw new HttpError(409, "REQUEST_ID_CONFLICT", "requestId already belongs to different content.");
        return { message: await records.findMessage(previous.message_id), replayed: true };
      }
      const at = new Date().toISOString();
      const message = { id: randomUUID(), conversation_id: id, role: "user", content: input.content, ordinal: await records.nextOrdinal(id), created_at: at };
      await records.insertMessage(message);
      await records.insertRequest({ principal_id: principal, conversation_id: id, request_id: input.requestId, content_sha256: hash, message_id: message.id, created_at: at });
      await records.touchConversation(id, at);
      return { message, replayed: false };
    });
  }
}
