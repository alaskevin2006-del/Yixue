# API contract
All mutations JSON except multipart file upload. Same-origin Cookie auth. Errors `{error:{code,message}}`. All protected requests must enforce ownership server-side.

## Core (core worker owns)
Same-origin opaque HttpOnly/SameSite=Strict cookie authentication. Login and me return csrfToken; send X-CSRF-Token on every authenticated mutation, including multipart. Production HTTPS cookies are Secure. Cross-origin mutations are denied. Dev identity headers never authenticate production routes.
GET /api/health -> {status:'ok',principalMode:'SESSION',persistence:'SQLITE',capabilities:{ai:boolean,vision:boolean}} (public; no provider details).
POST /api/auth/login {username,password} -> {user:{id,username,role},csrfToken}; Set-Cookie. Invalid credentials 401; ten failed attempts per username/IP within fifteen minutes cause 429.
POST /api/auth/logout -> 204.
GET /api/auth/me -> {user:{id,username,role},csrfToken}.
POST /api/auth/password {currentPassword,newPassword} -> 204; revokes all user's sessions, login again.
GET /api/admin/users -> {users}; POST {username,password,role} -> {user}.
POST /api/admin/users/:id/password {password} -> 204; revokes all target user's sessions.
Passwords minimum 10 characters, maximum 256 bytes. Usernames 2–64 letters/numbers or _ . @ -, case-insensitive unique; role user|admin, default user. No public registration or default password. First administrator requires environment bootstrap credentials.
GET/POST /api/subjects -> {subjects}/{subject}; POST {name}.
PATCH /api/subjects/:id {name?,icon?} -> {subject}.
GET/POST /api/subjects/:id/conversations -> {conversations}/{conversation}; POST {title?}.
GET/DELETE /api/conversations/:id -> {conversation:{...fields,latest_run:run|null}}/204. Delete removes original messages and request/run records; only a tombstone remains for independent source availability.
GET /api/conversations/:id/messages -> {messages,runs} (ascending message ordinal; runs include failures for reload recovery).
POST /api/conversations/:id/messages {content,requestId} -> {message,run,replayed}; 201 first submission, 200 replay. Exact content retained including indentation; content maximum 16000 characters, nonempty valid Unicode; requestId maximum 128. Same requestId with different content gives 409. Saves real user input, starts async AI; poll run and reload messages for completion. Failure saves no assistant placeholder.
GET /api/runs/:id -> {run:{id,conversation_id,user_message_id,status:'queued'|'running'|'completed'|'failed'|'cancelled',assistant_message_id,error_code,error_message,created_at,updated_at}}.
POST /api/conversations/:id/retry {messageId} -> {run}; 201 new attempt, 200 active attempt replay. Only latest unanswered user message can retry, including failed initial review; no duplicate user message. Answered or superseded message 409.
Subject shape {id,owner_user_id,name,icon,created_at,updated_at}; name max100, icon max40. Conversation fields {id,subject_space_id,title,kind:'learning'|'review',created_at,updated_at,deleted_at}; title max200, default 新对话. First user message replaces only that placeholder title with the first36 characters after normalizing whitespace; chosen titles remain. Message {id,conversation_id,role:'user'|'assistant',content,ordinal,created_at}.
JSON body maximum64KiB and must be object. Ownership failures return404. One active run per conversation; second new turn returns409 AI_IN_PROGRESS. At most2 active runs per user and4 overall by default (429 AI_BUSY). Reboot changes unfinished runs to failed AI_INTERRUPTED; explicit retry recovers. Missing configuration yields AI_NOT_CONFIGURED, provider failure AI_PROVIDER_ERROR, timeout AI_TIMEOUT, invalid result AI_INVALID_RESPONSE; never fabricate output. Errors include opaque requestId. Context uses at most24 recent messages and48000 total characters; current request and at most32000 characters of explicitly referenced resources/relevant or explicit learning evidence take priority over older history. Complete learning entries are selected before recording their provenance; omitted learning entries and resource excerpts are clearly marked. System rules remain separate. Optional YIXUE_AI_THINKING=disabled|enabled sends thinking:{type:...}; absent configuration omits this provider extension.

## Resources (resources worker owns)
GET /api/courses -> {courses}; POST {name} admin only -> {course}.
GET /api/resources?scope=private|public&courseId?&subjectId?&q? -> {resources} (private default).
POST /api/resources multipart fields file, name?, subjectId? -> {resource}, 201. File limit 20MiB; private owner is authenticated user.
GET /api/resources/:id -> {resource}; GET /api/resources/:id/download -> protected attachment.
GET /api/resources/:id/content?startPage?&endPage? -> {content,pages,extraction_status,error?,truncated}; text/pages actually extracted only.
POST /api/resources/:id/extract {startPage?,endPage?} -> {resource}; retries extraction, configured vision required for images/scans. PDF selected range max20 pages, vision max4 pages per request by default (hard max8); specify successive ranges to continue, preserving previously extracted pages. Automatic text extraction cap200 pages/200000 chars, explicit partial status and errors.
PATCH /api/resources/:id {name?,subjectId?} private owner only; null subjectId removes association -> {resource}.
DELETE /api/resources/:id -> 204; private owner or admin for public, removes file and extracted text.
GET /api/conversations/:id/references -> {references}; PUT {references:[{resourceId,startPage?,endPage?}]} -> {references}. Explicit replacement, maximum 12, no inheritance. Deleted resources return available:false; foreign private IDs denied.
GET /api/submissions -> {submissions} (own; admin all); POST multipart file,name?,courseId -> {submission}, 201. Independent uploaded copy, course required.
GET /api/submissions/:id/download -> protected attachment, submitter/admin only.
POST /api/submissions/:id/review {decision:'accept'|'reject',note?} admin only -> {submission,resource?}; repeat same decision returns same result, changed decision conflicts. Acceptance creates independent public resource and file.
Resource shape: {id,scope:'private'|'public',name,original_name,mime,size,course_id,subject_id,extraction_status:'pending'|'ready'|'partial'|'failed'|'unsupported'|'needs_vision',extraction_error,page_count,created_at,updated_at}. Internal paths/content are never listed. Submission shape includes status pending|accepted|rejected, public_resource_id, note (administrator review note), reviewed_at and reviewed_by. DOCX page1 is a text fragment, PDF pages and PPTX slide numbers follow their originals.
Reference shape: {id,resource_id,name,available,extraction_status,start_page,end_page}. Resource unavailable/extraction failure remains explicit; historical messages are retained. ZIP is downloadable, never read by AI. Public resources only from administrator-reviewed submissions.

## Continuity (root owns)
GET /api/subjects/:id/state -> {state:{content,version,updated_at}}.
PUT /api/subjects/:id/state {content,version} -> {state}.
POST /api/subjects/:id/state/preview {input} -> {content,version} (no write).
POST /api/action-advice {input,subjectIds?} -> {advice} (no persistence).
GET /api/subjects/:id/memories -> {memories}.
PATCH /api/memories/:id {content?,title?,status?,version} -> {memory}.
DELETE /api/memories/:id -> 204.
POST /api/subjects/:id/reviews {sourceIds,focus?,requestId} -> {conversation,warning?:{code,message}}; creates kind=review with selected sources, initial user question and generated assistant; provider failure preserves user input and returns explicit warning (user can retry in review conversation).
GET /api/reviews/:id/sources -> {sources}.
PUT /api/reviews/:id/sources {sourceIds} -> {sources} (subsequent answers only).
GET /api/reviews/:id/candidates -> {candidates}.
POST /api/reviews/:id/candidates {} -> {candidates}; explicit extraction only.
POST /api/candidates/:id/decision {action:'keep'|'ignore',content?,title?,targetMemoryId?,version?} -> {candidate,memory?}.
GET /api/memories/:id/sources -> {sources} with available flag, no deleted original content.
GET/PUT /api/conversations/:id/memory-references -> {memories}; PUT {memoryIds:[]} replaces explicit selection, maximum8; same subject only, includes inactive when explicitly chosen.
Memory shape {id,subject_space_id,title,content,status:'active'|'inactive',summary,version,created_at,updated_at,sources:[{id,title,available}]}.
Candidate shape {id,review_id,title,content,suggested_status:'active'|'inactive',target_memory_id,target_memory_version,status:'pending'|'kept'|'ignored',memory_id,created_at,sources:[{id,title,available}]}.
