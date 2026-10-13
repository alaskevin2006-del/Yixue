# Yixue usable release — approved 2026-10-13

Deadline: 2026-10-14 08:00 Asia/Shanghai. User approved full implementation and deployment, autonomous decisions, parallel work, and continuing independent work around external blockers. Never store credentials in this repository.

Authority: read docs/逸学｜产品行为设计基线.md first, then relevant docs models. Product definitions are unchanged. The detailed approved plan is in this chat, writing block 71386. This file captures binding execution contracts.

## Acceptance scope
- Real administrator-provisioned accounts, login/logout/change password/admin reset; tenant isolation.
- Subjects, icon persistence, conversations, user and assistant messages, idempotency, deletion, restart recovery.
- Server-side AI provider, bounded context, relevant Active memories, explicit resource reference only, failure and retry with no fabricated answer.
- Private and public resources, courses, submissions, administrator acceptance creates independent public resource; rejected submissions not public.
- PDF/text/Markdown/code/DOCX/PPTX extraction; PNG/JPEG/scanned PDF via available vision/OCR; ZIP downloadable only; 20 MiB default upload cap. Extraction errors explicit, never claim unread content read.
- User-selected review sources, real AI reviews, candidate extraction, edit/ignore/keep, update stable existing memory, Active/Inactive, sources, subsequent reuse.
- One natural-language subject state, versioned explicit edits/adoption; AI proposals never overwrite automatically.
- Real action advice using states and current constraints; arrangements ephemeral, no action history or persistent calendar.
- HTTPS deployment, durable local DB/files, health, logging, backup/restore, browser and API checks.

User clarification during execution: use official DeepSeek; leave a server-side API-key configuration slot. Delivery may have an empty key, with honest unconfigured AI status and verified integration contract; do not treat missing key as a delivery blocker or claim live AI validation. Default official endpoint/model/vision capability are configured in .env.example. Remote deployment and all non-AI persistence/interaction acceptance remain required.

## Approved product rulings
- Small-group multi-user, admin provisions accounts; no public registration or external email/SMS dependencies.
- Private resource belongs to user; subject association does not transfer ownership.
- Explicit resource references persist per conversation; new conversations do not inherit. Validate permissions on every use.
- Candidate creation requires user request; adoption persists memory. Ordinary conversation never silently writes memory/state.
- Deleting original conversation revokes original access; independent confirmed memories remain, with unavailable-source indication. No hidden raw-original copies.
- Deleting private file removes extraction and future use; existing historical answers remain with inaccessible-source marker.
- Acceptance of submission creates independent public entity and preserves submission decision.
- User may edit/delete memory and set Active/Inactive; same-point candidate can update stable existing ID with version protection.
- Homepage proposals/arrangements are current-session only. All actual long-lived objects persist server-side.

## Shared implementation contracts
Use native Node ESM and node:sqlite. Keep existing domain for compatibility if useful, but production entrypoint must authenticate real sessions. Core owner implements Store in server/store.js:
`new Store(path)`, `get(sql,...params)`, `all(sql,...params)`, `run(sql,...params)`, `transaction(fn)` synchronous atomic callback, `close()`. Public `.db` DatabaseSync allowed for migrations only. Network calls NEVER inside transactions.

Feature modules export `async handleResources(ctx)` or `async handleContinuity(ctx)`. Return null if route not owned, otherwise `{status,body,headers?}`. Download response is `{status:200,file:{path,name,mime,inline:false}}`. ctx = `{method,path,url,req,principal,store,config,body,ai}`. `principal={id,username,role}` or null; normal feature handlers require it (core guarantees). `body()` async returns validated JSON raw object; multipart resources consume req directly. Throw HttpError(status,code,message) from existing server/errors.js. Module initializer `initResources(store,config)` / `initContinuity(store,config)` idempotent CREATE TABLE IF NOT EXISTS. Core calls both once before serving, passing AI service as needed through ctx.

Core tables (snake_case): users(id,username,password_hash,role,disabled,created_at), sessions; subjects(id,owner_user_id,name,icon,created_at,updated_at); conversations(id,subject_space_id,title,kind,created_at,updated_at,deleted_at); messages(id,conversation_id,role,content,ordinal,created_at); ai_runs. Preserve/migrate legacy user_principals and message_requests without destroying old data. Feature owners own only their extra tables and schemas.

AI contract: `ai.generate({purpose,messages,system,signal?}) => Promise<string>`; messages supports provider chat-style content string or multimodal arrays; `ai.configured` boolean, `ai.capabilities` where available. Missing config throws HttpError(503,'AI_NOT_CONFIGURED',...). System prompts and original evidence separate. Provider URL/key/model from env only, never logs. Health reports capability honestly. Provider retries bounded.

API responses use `{subjects}`, `{subject}`, `{conversations}`, `{conversation}`, `{messages}`, `{message,run?}`, `{error:{code,message,requestId?}}`. UI reads API.md after owner updates contracts. Core response IDs snake_case match existing frontend. All owners update engineering/API.md for their routes; use own section only.

## Ownership
- Core worker: server/store.js, server/auth.js, server/ai.js, server/core.js, server/production.js, server/start.js, server/config.js, tests/backend/core*.test.js; no resource/continuity/frontend files.
- Resources worker: server/resources.js, server/resource-* modules, tests/backend/resources*.test.js; feature dependencies reported to root (do not edit package files).
- Frontend worker: index.html, app.js, styles.css, client/, scripts/build.mjs, frontend tests; use API contracts. No backend or package changes.
- Root: server/continuity.js and helpers, integration wiring as coordinated, package files, deployment, tests integration, engineering ledger.

## Phases
1. Baseline/environment + shared contracts. 2. Concurrent module implementation with failing behavioral tests first. 3. Integration + task review. 4. Complete cross-module real flows. 5. Deployment, regression, restore and final independent review.

## Verification requirements
Tests must exercise real database and HTTP behavior. External AI may be replaced by an injected adapter in tests, but live AI acceptance requires a real configured service. No source-text assertions. Include tenant denial, replay, restart, stale versions, deleted source/reference, provider error/retry, approval idempotency, context access boundaries. Browser acceptance at desktop and 390px/320px. Test zero-count is failure, never pass claim.

## Preflight dependency audit
| Pair | Contract | Resolution |
| Core/resources | Store + ctx + download response | Fixed above; root integrates imports |
| Core/continuity | Store + AI + schema | Fixed above; continuity uses core messages/conversations |
| Frontend/all | Route JSON | API.md, no fixture fallback; communicate changes |
| Resources/AI | extraction/reference content | resources exports getReferenceContext(store,principal,conversationId,config) |
| Continuity/AI | relevant memory context | continuity exports getMemoryContext(store,principal,subjectId,query) |
| Every task | tests vs deliverable | Test persistence and business behavior, no static-only verification |

Root handles shared integration after worker modules are stable. User approved parallel execution; disjoint files override skill's default sequential implementers.
