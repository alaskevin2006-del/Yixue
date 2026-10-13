# Frontend independent review — 2026-10-14

Reviewed `app.js`, `client/`, `index.html`, responsive CSS and frontend tests against the approved API contract and current product models. Scope: actual persistence/AI flows, asynchronous state and account boundaries, save failures, untrusted Markdown/math rendering and core mobile access. No implementation edits by the reviewer.

## Final re-review

**No open frontend finding remains from this review.** The three independently reproduced defects below have been fixed and rechecked. Final build and frontend tests passed **23/23**, including all four reviewer checks and the 390px/320px core-flow checks.

## Resolved findings

### [P2] Preserve the original composer text when sending

Location: `app.js:119`, `submitMessage`, assignment from `input.value.trim()` at discovery.

The UI trims the entire user message before sending, despite the core API's exact-original contract. Pasting an indented Python fragment removes the first line's indentation and the final newline permanently from the saved original. Use the raw textarea value as content and use trimming only to detect an empty message.

Real-browser evidence: `composer preserves original leading code indentation and trailing newline` in `tests/frontend/review-repro.test.js` sends `"    if ready:\n        execute()\n"`; the actual database contains `"if ready:\n        execute()"`.

Resolved: the raw textarea value is now sent; `trim()` only checks for empty content. The browser/database exact-original assertion passes.

### [P2] Discard a state preview after changing its editor subject

Location: `client/continuity.js`, `renderState` preview form callback calling `stateProposal(subjectId,proposal)` after awaiting AI (line 37 at discovery).

While the AI preview for subject A is pending, the user can select subject B in the same state dialog. A's late response replaces B's displayed editor with A's proposal while B remains selected, and the adoption callback still writes to A. The preview completion must verify the captured editor generation, subject identity and open dialog before replacing the editor. It must also not replace manual edits started after the request.

Real-browser evidence: `late AI state preview does not replace the editor after changing subjects` delays only the external AI adapter, switches to B and releases A's actual endpoint response. The editor changes from B's title to `整理建议`, containing A's proposal.

Resolved: the preview and state response handlers check the captured epoch, selected subject and open dialog before rendering; direct editing also advances the epoch. The late-A/selected-B regression now passes.

### [P2] Prevent old authentication responses from replacing the current CSRF token

Location: `client/api.js:21` at discovery, unconditional `if (data.csrfToken) csrfToken=data.csrfToken`; `app.js` session-generation wrapper was too late to protect this cache.

With an existing A session, reload while the initial `/api/auth/me` response is delayed. The login form remains usable; log into B before the old response arrives. A's eventual successful response is correctly discarded by the application state guard but has already overwritten the transport's cached CSRF token. The page shows B while every subsequent mutation fails with `403 CSRF_DENIED` until reload. Tie token updates to authentication request/session generations so a newer login invalidates earlier identity checks before they can update shared credentials.

Real-browser evidence: `an old bootstrap response cannot replace the new account CSRF token` holds a real `route.fetch()` response from A, completes B's actual login, then releases A's response. A subject creation through the actual client API returns `{saved:false,code:'CSRF_DENIED'}` instead of success. No API response body is fabricated.

Resolved: the transport increments authentication generation when a login/logout starts, rejects obsolete responses before and after JSON parsing, restricts token updates to current identity/login responses, and exposes session reset. Both the real-browser account-switch regression and the transport regression now pass.

## Final verification

Initial independent run: **3 tests, 0 passed, 3 failed**, establishing the findings before fixes. The harness uses real SQLite, authenticated HTTP routes and browser UI; only AI generation is an injected external boundary. A fourth check verifies a real `409` state-version conflict retains the unsaved textarea draft, displays the server error and leaves the other saved version intact.

Final commands: `npx --yes node@24 scripts/build.mjs`, then `npx --yes node@24 --test --test-concurrency=1 tests/frontend/*.test.js`: **23 tests, 23 passed, 0 failed, 0 skipped** (12 existing browser cases, 7 client cases, 4 independent review cases). Desktop and 390px/320px core flows passed. No aesthetic redesign was included.

The inspected renderer sanitizes Markdown before insertion, disallows active/embed/form tags, renders KaTeX with `trust:false`, and uses `textContent` for user originals and metadata. Existing browser tests cover hostile markup, code/math rendering, persisted/retried chat, selected resources, reviewed memories, state adoption, submissions and 390px/320px flows. No additional confirmed finding was raised from these inspected paths during this pass. Live provider output and remote deployment are outside this frontend certification.
