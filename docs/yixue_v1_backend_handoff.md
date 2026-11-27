# 逸学 V1 前后端联调交接

本交接记录当前 React 前端实际发出的请求、依赖的字段和联调顺序。项目范围见同分支的 [逸学 V1 开发计划](./yixue_v1_development_plan_updated.md)，前端代码位于 [`frontend-v1` 的 `frontend/` 目录](https://github.com/alaskevin2006-del/Yixue/tree/frontend-v1/frontend)。接口路径以 `frontend/src/api/client.ts` 为准，数据结构见 `frontend/src/api/types.ts`，上传流程见 `frontend/src/api/upload.ts`。

## 从本地开始

在 `frontend-v1` 分支进入 `frontend/`，执行 `npm ci` 和 `npm run dev`。默认由 MSW 提供本地演示，可使用 `student@example.test` 和验证码 `123456`。演示投稿、文件和登录验证码由本地 Mock 管理，正式邮件发送、会话、附件存储和审核需要后端接入。

联调时在 `frontend/.env.local` 写入以下配置，将端口换成后端实际监听端口，然后重启 Vite。

```dotenv
VITE_ENABLE_MOCKS=false
YIXUE_API_PROXY=http://127.0.0.1:8000
```

浏览器统一请求同源 `/api/v1`，Vite 开发环境代理到后端。生产环境也需要在站点同源转发 `/api/v1`，并让前端页面的直接访问和刷新回退到 `index.html`。对外分享链接可通过 `VITE_SITE_URL` 指定正式站点域名。

## 公共响应和会话

- API 路径都带 `/api/v1`。下表省略这个前缀。
- 成功响应为 `{"code":"OK","message":"success","data":...}`。退出和取消上传可返回 `data: null`，前端仍需要 JSON 成功响应。
- 错误使用合适的 HTTP 状态和 `{ code, message, data }` 结构。表单会直接展示 `message`。未登录用 `401`，权限不足用 `403`，重发过快用 `429`。
- 分页响应中的 `data` 为 `{ items, total, page, page_size }`。`total` 是当前筛选后的总量，`page` 从 1 开始。
- 登录成功后由后端设置会话 Cookie。前端使用同源 Cookie 请求。未登录访问受保护页面会进入 `/login`，成功后回到原页面。

## 邮箱验证码

| 请求 | 前端传入 | 前端使用的响应 |
| --- | --- | --- |
| `POST /auth/start` | `{ email, return_to }` | `{ mode: "code", challenge_id, expires_in, resend_after }` |
| `POST /auth/verify` | `{ challenge_id, code }` | 用户对象 `{ id, display_name, email, role }`，并设置会话 Cookie |
| `GET /auth/me` | 当前会话 Cookie | 同一用户对象，`role` 为 `user` 或 `admin`，未登录返回 `401` |
| `POST /auth/logout` | 当前会话 Cookie | 清除会话并返回成功 JSON |

`expires_in` 和 `resend_after` 以秒为单位。当前产品需要 **30 秒重发间隔**，本地 Mock 已执行这个限制。正式环境请在服务端同样按 30 秒限流，并返回 `resend_after: 30`，页面按接口值倒计时。校内邮箱范围、验证码有效期、错误次数限制和首次验证建号由后端实现，其中有效期以 `expires_in` 告知前端。

## 资料与征集接口

| 请求 | 用途与关键字段 |
| --- | --- |
| `GET /catalog` | 返回 `colleges`、`resource_types`、`grades`、`semesters`，可选 `years`。分类项为 `{ id, name, active }`，年级和学期选项为 `{ value, label }`。 |
| `GET /courses`、`GET /courses/:id` | 资料筛选和投稿选课。课程记录另含 `college_ids` 和 `aliases`。列表支持 `keyword`、`college_ids` 和分页。 |
| `GET /resources`、`GET /resources/:id` | 首页、资料索引和详情。详情另含 `description` 和 `request_id`。 |
| `GET /requests`、`GET /requests/:id` | 资料征集与详情。列表支持 `status`、`keyword`、`college_ids` 和分页。状态为 `open`、`completed`、`closed`。 |
| `GET /admin/dashboard` | 当前管理端所需汇总 `{ resource_count, pending_count, open_request_count }`。 |

资料索引使用 `keyword`、`sort`、`page` 和 `page_size`。排序为 `latest`、`year_desc` 或 `popular`。多选条件使用可重复查询参数 `college_ids`、`course_ids`、`type_ids`、`grades`、`semesters`、`years`，例如 `college_ids=cs&college_ids=se`。前端从列表的 `total` 读取学院入口数量及征集各状态数量，有些统计查询会传 `page_size=1`。

资料的 `title` 用于标题展示，附件的 `filename` 保存上传原名，用于附件展示和下载。文件大小传整数 `size_bytes`，前端负责单位换算。资料 `files` 中每项需提供 `id`、`filename`、`content_type`、`size_bytes` 和 `preview_supported`。如附件不能下载，显式返回 `download_supported: false`。`archive_code` 可选，有值时优先展示。年份用数字或 `null`，学期用 `first`、`second` 或 `null`，日期使用可解析的 ISO 8601 字符串。

征集详情的 `colleges`、`course`、`resource_type`、`grades`、`semester` 和 `year` 用于预填投稿。可关联投稿的征集必须仍为 `open`，提交时需要后端重新校验。

## 投稿、文件检查与发布

| 步骤 | 请求 | 前后端约定 |
| --- | --- | --- |
| 获取上传限制 | `GET /uploads/config` | 返回 `max_file_size_bytes`、`allowed_extensions`、`max_attachments`。 |
| 申请上传计划 | `POST /uploads/presign` | 请求 `{ filename, size_bytes, content_type }`。返回 `{ upload_id, method, url, headers, expires_at, form_fields? }`。 |
| 上传文件 | 按上传计划访问 `url` | `PUT` 发送原始文件，`POST` 使用 `form_fields` 和名为 `file` 的表单字段。前端按计划附上 `headers`。 |
| 确认传输 | `POST /uploads/:id/complete` | 请求体 `{}`，返回 `{ upload_id, status, file_id, filename, reason }`。 |
| 查询检查结果 | `GET /uploads/:id` | `checking` 时前端每 2 秒轮询，最多 25 次。`ready` 必须带 `file_id`，`failed` 建议提供可展示的 `reason`。 |
| 移除或失败清理 | `DELETE /uploads/:id` | 清理未发布上传，返回成功 JSON。 |
| 提交资料 | `POST /resources` | JSON 提交资料字段，带 `Idempotency-Key` 请求头，成功返回 `ResourceDetail`。 |

提交资料包含 `title`、`college_ids`、`course_id`、`type_id`、`grades`、`semester`、`year`、`source`、`version`、`description`、`file_ids`、`request_id` 和 `share_confirmed: true`。服务端需确认文件已检查通过且归当前用户所有，确认课程、学院与征集关系有效。前端对相同表单重试会沿用同一个幂等键，后端应返回原提交结果，避免生成重复资料。响应包含 `visibility`、`safety_status` 和 `review_status`，提交结果页按可见性和审核状态显示提示。

## 预览和下载

- `GET /files/:id/preview?resource_id=...` 申请预览链接。
- `POST /files/:id/download` 使用 `{ resource_id }` 申请下载链接。
- 两者返回 `{ url, expires_at, filename, content_type, size_bytes }`。`url` 可为同源路径或可访问的临时链接。签发前检查会话、资料可见性及附件归属。
- 如使用跨域对象存储，放行前端来源对签名地址的上传和预览请求。PDF 在线阅读需要能读取 PDF 响应，支持 Range 请求可避免打开大文件时一次性加载全部内容。
- 跨域下载地址的响应应设置 `Content-Disposition: attachment` 并带原始文件名，以便浏览器按附件保存。

## 推荐的联调顺序

1. 打通邮件验证码、会话 Cookie、登录回跳和退出，确认 30 秒内服务端拒绝重发。
2. 联调首页、学院筛选、资料分页和征集状态总数，核对空列表和 `401` 场景。
3. 走通征集详情 → 响应投稿 → 上传检查 → 提交，验证失败提示、移除文件及同键重试。
4. 用提交后的资料检查标题与原始文件名分别显示，验证 PDF 预览、下载和详情直链刷新。

当前接口类型由前端手写。后端确定 OpenAPI 后，优先对齐正式字段、枚举和错误响应，再用生成类型替换手写契约。
