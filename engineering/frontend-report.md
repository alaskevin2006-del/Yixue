# Frontend release report

## Delivered

The production entrypoint now authenticates real server sessions. Production subject, conversation, resource, review, memory and state screens use the documented APIs; the fixed dates, planner fallbacks, fabricated replies and fixture resources are removed. The existing neutral green palette, primary navigation, subject workspace and responsive shell remain.

- Login/logout, administrator account provisioning/reset and user password changes. Mutations carry server-issued CSRF tokens, including multipart uploads. Account transitions invalidate old response generations before either UI state or cached credentials can change.
- Persistent subject names/icons and conversation history. Original user messages retain indentation and trailing newlines. Actual asynchronous AI runs show progress, explicit failures and retry without duplicating the original question; queued/failed runs can be recovered after reload.
- Sanitized Markdown, code copying and locally bundled KaTeX for dollar and backslash TeX delimiters. Untrusted active/embed/form content is removed; formulas render with trust disabled.
- Private uploads, subject association, public courses/search, extraction results/retry with page ranges, downloads/deletion, independent submissions and administrator review. Explicit conversation references are selectable and removable; unread/deleted content remains visibly unavailable.
- Review source selection and subsequent chat, including source-free direction clarification with an honest empty-source label. Explicit candidate extraction, edit/keep/ignore, stable existing-memory updates, Active/Inactive editing, original source availability, and explicit memory selection/removal in a conversation.
- One natural-language subject state with versioned direct editing and AI preview/adoption. Late previews are discarded after subject/editor generation changes or dialog closure. Stale-version errors preserve the unsaved draft.
- Actual action advice using server-side states and current input. Adopted/edited arrangements remain only in this page session and disappear on reload; adoption does not update subject state.

Frontend code is split into `client/api.js`, `workflows.js`, `ui.js`, `render.js`, `resources.js`, and `continuity.js`. Build copies the modules and local rendering distributions into `dist/` without remote/CDN dependencies. No backend or package files were edited by the frontend owner. Root maintains the separate legacy demo.

## Verification

Fresh final command using bundled Node 24.19.0:

`node --test --test-concurrency=1 tests/frontend/client.test.js tests/frontend/browser.test.js tests/frontend/review-repro.test.js`

**23 tests passed, 0 failed, 0 skipped**: 7 transport/run helper tests, 12 complete Edge browser flows, and 4 independent review regression cases. Browser harnesses run real authentication, HTTP APIs, SQLite and file storage; only the external AI boundary uses an injected test adapter. Random test passwords and storage are process-local/temporary and removed after execution.

`node scripts/build.mjs` passed after the final test run. The native directory copier replaces `fs.cpSync`, which crashed the installed Windows Node 22 runtime on this workspace.

Covered real browser operations include persisted icons/messages, provider failure/retry, hostile Markdown plus code/math, Chinese filename upload/download, deleted-reference markers, review/candidate/memory lifecycle and stable updates, inactive explicit use, deleted memory sources, state preview/adoption, ephemeral arrangements, submission acceptance, account reset/password change and account isolation. Independent review additionally proves original-code preservation, stale preview exclusion, stale CSRF response exclusion and draft retention on version conflict.

Screenshots in ignored `test-results/frontend/` include desktop learning/review/home and 390px/320px learning/upload plus 320px home/state/library. Owner visually inspected these surfaces; mobile core controls remain reachable, with no horizontal page overflow. The home thread uses normal document flow so it cannot cover earlier advice or arrangements.

## Scope limits

Live external-provider output is not certified by these tests; the approved server environment slots are the configuration boundary. No AI configuration page was added. Deployment, durable backup/restore and the final combined backend regression are owned by root.
