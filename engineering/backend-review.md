# Backend independent review — 2026-10-13

Reviewed the uncommitted production backend against baseline `9fa699820f37fc6ab40a0b62ab6f1c272bbb470c`, the approved overnight plan/API contract, and current product baseline, Boundary, Principles and relevant Models. Scope: auth, core/AI/store/start, resources/extraction, continuity, static serving, offline backup/restore and backend tests. No implementation files changed by this review.

## Final re-review

**No open finding remains from this review.** All four independently reproduced issues below have been fixed and rechecked. The final backend run passed **64/64 tests** with no skipped tests. The original locations below describe the reviewed defect; resolution paragraphs identify the current fix.

## Resolved findings

### [P1] Revalidate the conversation after awaiting a message request body

Location: `server/core.js:74-77`.

The messages route resolves a live conversation before awaiting `body()`, but does not recheck it in the subsequent write transaction. Start a message POST with an unfinished body, delete that conversation in a second request, then finish the first body. The POST succeeds and inserts the raw user message, request and AI run into the deleted conversation. The worker subsequently fails its access check, but the raw original remains indefinitely; repeating DELETE cannot clear it because the tombstone now returns 404. This violates the approved deletion guarantee and can occur during overlapping requests from different tabs or a slow upload. Require the live conversation again immediately before the transaction writes (and audit similar pre-body lifecycle checks).

Evidence: `tests/backend/backend-review-repro.test.js:45` exercises the real core and SQLite store with a delayed body. Expected zero remaining messages and 404; actual message count is **1** after successful DELETE and drained work.

Resolved: `server/core.js:105-108` revalidates after body receipt and within the transaction. The regression now confirms 404 and zero recreated original messages. Retry also revalidates after body receipt.

### [P2] Use named columns when creating a review in an upgraded database

Location: `server/continuity.js:195`.

`INSERT INTO conversations VALUES (...)` assumes `kind` is column four. A fresh Store has that layout, but migrating the supported v1 schema appends `kind` after `deleted_at`. Every review creation on that upgraded database therefore inserts `NULL` into `kind` and raises `NOT NULL constraint failed: conversations.kind` (HTTP persistence failure). Other current conversation creation correctly uses named columns. Specify the review insert columns so both supported layouts work.

Evidence: `tests/backend/backend-review-repro.test.js:21` creates the actual v1 schema, upgrades with Store, initializes continuity and invokes the real review handler. It fails at this insert before AI generation.

Resolved: `server/continuity.js:202` uses named columns. The real v1 migration/review regression now passes.

### [P2] Reserve context capacity for explicitly selected evidence before filling history

Location: `server/core.js:33-35`.

The builder consumes the complete 48,000-character budget with recent history before appending evidence. A valid 16,000-character previous user message, 16,000-character assistant answer and 16,000-character new question leave zero space: the provider receives an empty evidence message, silently losing explicitly selected learning memories/resources/review sources. `recordAnswerSources` still receives the unfiltered learning result, so durable provenance can claim a memory was used despite its text never reaching the provider. Reserve a bounded evidence allocation alongside the current question, then use remaining space for older history; record only evidence actually passed.

Evidence: `tests/backend/backend-review-repro.test.js:33` uses the real learning-context selector with an explicitly selected inactive memory and captures only the external AI adapter boundary. The generated input respects 48,000 characters but does not contain `EXPLICIT_MEMORY_EVIDENCE`.

Resolved: `server/core.js:11-43` reserves the current question and evidence capacity before older history, includes structured learning entries atomically, and returns only included evidence for provenance. The original full-history repro and core regression excluding omitted memory IDs both pass. Continuity's initial review also records the actual returned context entries.

### [P2] Recheck same-point memory conflicts when adopting a previously extracted candidate

Location at discovery and fix: `server/continuity.js:262-267`.

Two reviews could each extract the same title/content while no memory existed, leaving both candidate targets null. Keeping both then created two independent memories because same-point matching happened only during extraction. The independent regression demonstrated two rows instead of one.

Resolved: adoption checks normalized titles in the same subject inside its write transaction and returns `409 MEMORY_POINT_CONFLICT` if another adoption already created the point. It preserves the existing memory and requires explicit target/version selection instead of silently overwriting. The regression `pending same-point candidates cannot create duplicate memories after another adoption` now passes.

## Verification

Initial run: **53 tests, 50 passed, 3 failed**, establishing the original three defects before fixes. Second review independently exposed the fourth defect and verified its correction.

Final command: `npx --yes node@24 --test tests/backend/*.test.js`: **64 tests, 64 passed, 0 failed, 0 skipped**. `tests/backend/backend-review-repro.test.js` now has five passing checks: four regression tests and an additional offline restoration check using real resource metadata, extracted text, a blob file, protected download and foreign-tenant denial after restoration. Only AI provider boundaries are substituted; database, core/continuity/resource handlers and backup/restore implementations run directly.

The re-review also inspected and ran coverage for post-deletion candidate adoption, delayed resource-reference writes, late extraction results, UTF-8 Chinese multipart filenames, bounded actual provenance, and optional provider `thinking` payloads (`enabled`/`disabled`, omitted when unconfigured).

## Deployment and backup review limits

Inspected `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`, `deploy/Caddyfile`, `deploy/README.md` and `scripts/backup.mjs`. Container configuration uses the non-root Node user, durable `/data` mounts, an internal-only application port, health-gated reverse proxy and HTTPS production-origin enforcement. Setup instructions require writable UID 1000 host data directories and private environment files. Offline backup/restore validates SQLite integrity, checksums and referenced file availability and refuses destination overwrite; real restored private resources remained readable only to the owner in the added check.

Docker is unavailable in this review environment, so image build/Compose execution is not certified. The remote server remains unreachable; HTTPS, certificates, remote filesystem permissions and live deployment are not certified. The user-approved empty DeepSeek key means AI health remains unconfigured until supplied. The adapter's HTTP contract is tested against a local external-service substitute; this does not certify real DeepSeek output or OCR quality.

No additional actionable issue was established in tenant denial, CSRF, path containment, upload/file extraction boundaries, independent resource-domain acceptance, provider error/retry, reviewed versioned state/memory writes, static allowlisting or offline backup/restore during this pass. That statement is limited to inspected code and executed tests; configured live AI and external HTTPS deployment were unavailable and are not certified by this review.

## IP-only deployment addendum — 2026-10-14

The later `compose.ip.yaml`, `deploy/Caddyfile.ip`, certificate script and systemd timer were reviewed separately. One configuration defect was found: **[P1] force Caddy to reload renewed manually loaded certificates**. `deploy/ip-certificate.sh` invokes `caddy reload` with an unchanged Caddyfile after Certbot updates the files. Caddy can skip the reload when configuration is unchanged, retaining the old certificate despite successful renewal. Add `--force` so renewed certificate files are reprovisioned. This behavior and the intended manual-certificate use are explicit in [Caddy's official reload documentation](https://caddyserver.com/docs/command-line#caddy-reload). This was a configuration/documentation finding, not a claim of having executed Docker or issued certificates.

**Resolved by static re-review:** `deploy/ip-certificate.sh:38` now supplies `caddy reload --force --config /etc/caddy/Caddyfile`. No open configuration finding remains from this pass. The target host still requires actual `renew --dry-run`, successful renewal/reload, served-certificate freshness and trusted-chain checks. Local syntax checks and this static correction do not certify those external steps.
