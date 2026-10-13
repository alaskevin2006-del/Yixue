# Resources implementation report

Implemented in `server/resources.js`, `server/resource-files.js`, `server/resource-extract.js`; behavioral tests in `tests/backend/resources.test.js`. Resource route contracts published in the Resources section of `engineering/API.md`.

## Product and ownership boundaries

- `private_resources`, `public_resources`, and `resource_submissions` are independent business domains. Shared `resources` stores file metadata/extraction. A database trigger disallows changing an existing resource's domain. Submission acceptance creates a distinct public business row, resource ID, and physical file; repeating the same decision returns the original public ID. Rejection never creates public data, and a conflicting decision returns 409.
- Private resources belong to the authenticated user. Subject association validates that user's subject ownership and never changes file ownership. Administrators cannot read another user's private resource through these routes.
- Public resources are course-organized. Only administrator review can produce a public resource. Course creation is administrator-only.
- References are explicit per conversation, at most 12, persisted and rechecked for conversation ownership and resource access every time. New conversations inherit nothing. Deleting an original resource removes extraction and the file; retained references expose unavailable markers and no raw original content. Historical answer messages are untouched. Startup completes interrupted deletions.
- No ordinary conversation or automatic retrieval writes references, reviews, memory, or subject state.

## Storage, extraction and limits

- Server-only UUID `.blob` file names; protected uploads directory outside served static assets. Upload and download permissions enforced server-side. Path/key validation, symlink rejection, MIME/content signatures, UTF-8 text decoding and multipart limits. Exactly 20 MiB is permitted; larger uploads rejected. ZIP supports download only.
- TXT, Markdown and common code formats: actual UTF-8 text. DOCX: actual paragraph/table text in `word/document.xml`, represented as text fragment 1. PPTX: actual slide text in presentation relationship order. PDF: actual page text via PDF.js. PNG/JPEG and scanned PDF: configured multimodal provider transcription, with PDF rendered through `@napi-rs/canvas`; no fake extraction.
- Extraction keeps explicit `ready`, `partial`, `failed`, `unsupported`, or `needs_vision` status. Automatic textual extraction bounded to 200 pages and 200000 characters. Readable pages are retained when a later page's model call fails.
- Vision limit defaults to four pages per extraction request, configurable `maxVisionPages` clamped to 1–8. Total model extraction deadline defaults to 45 seconds, `extractionTimeoutMs` clamped to 1–120 seconds; propagated AbortSignal is respected by production AI adapter.
- `POST /api/resources/:id/extract {startPage,endPage}` processes up to 20 explicitly selected PDF pages and accumulates actually extracted pages. This permits deliberate continuation of long scans without one unbounded model request. Status remains partial until stored pages cover the document within character budget.
- AI reference context defaults to 16000 characters (hard max32000), includes actual selected page/fragment content only and warns about missing/truncated content. Public extraction retry is administrator-only; private retry requires its owner.

## Integration contract

`initResources(store, config)` is synchronous and idempotent. `handleResources(ctx)` is asynchronous and returns null for unowned routes or `{status,body}` / protected `{status,file:{path,name,mime,inline:false}}`.

`getReferenceContext(store, principal, conversationId, config)` returns synchronously:

```js
{ content: String, references: [{ id, resource_id, name, available,
  extraction_status, start_page, end_page }], truncated: Boolean }
```

Config uses `uploadsDir` (accepts `uploadDir` alias), `maxUploadBytes` capped at20MiB, `resourceContextChars`, optional `maxVisionPages` and `extractionTimeoutMs`. AI requires `configured` and `capabilities.vision` for multimodal extraction.

Dependencies reported to package owner and installed: `busboy`, `fflate`, `pdfjs-dist`, `@napi-rs/canvas`. Tested with Node24.21.0. PDF.js6 cleanup uses loading-task destruction (v6 has no document.destroy).

## Verification

Resource tests: 19/19 passed, using real production Store/SQLite, temporary disk files, real multipart HTTP upload/download, restart recovery, tenant/ref/delete access boundaries, exact upload cap, spoofed MIME/path denial, independent submission/public/private files and domain records, accepted/rejected review replay, real DOCX/PPTX/PDF decoding, real native scan rendering, bounded multimodal extraction with injected external AI, partial-page error preservation and explicit continuation. Browser UTF-8 Chinese filenames are preserved in private/submission names and download names; multipart parameter decoding explicitly uses UTF-8.

Fresh full backend run: `npx --yes node@24 --test --test-concurrency=1 tests/backend/*.test.js` — 60/60 passed, zero failures/skips. Earlier in-progress core/backup failures were fixed by their owners before this final run.

Concurrency regression: a conversation deleted while the reference request waits for its JSON body no longer gains reference rows; ownership/deletion is rechecked inside the writing transaction. A late image extraction result during upload cannot recreate content after resource deletion, confirmed by a controlled delayed-provider test.

## External acceptance and honest limits

Live provider credentials and a model with vision capability are still needed for end-to-end production OCR acceptance; local tests inject the external provider while exercising actual rendering/storage/routes. No credential was read or written by this worker. Text extraction does not claim comprehension of embedded DOCX/PPTX graphics, PDF diagrams, unread image regions or unprocessed pages. OOXML containing no readable body text is explicitly failed. Unsupported legacy `.doc`/`.ppt`, encrypted/corrupt documents, non-UTF-8 text and extraction over limits return explicit failure/unsupported behavior rather than fabricated content. ZIP is never used in AI context.
