import { http, HttpResponse } from "msw";
import type {
  Attachment,
  CreateResource,
  RequestItem,
  ResourceDetail,
  UploadInit,
  UploadState,
} from "../api/types";
import { sessionEmail } from "./auth";
import { catalog, courses, resources } from "./fixtures";
import { base, denied, missing, ok, paginate, problem } from "./responses";

const time = new Date().toISOString();
const requestSamples: {
  title: string;
  description: string;
  status: RequestItem["status"];
  course: number;
  type: number;
}[] = [
  {
    title: "征集数据结构期末真题",
    description:
      "欢迎分享可以公开的往年数据结构期末试卷、回忆卷或对应参考答案。",
    status: "open",
    course: 0,
    type: 0,
  },
  {
    title: "征集操作系统复习笔记",
    description: "希望补充包含进程调度、内存管理和文件系统章节的课程笔记。",
    status: "open",
    course: 1,
    type: 1,
  },
  {
    title: "征集机器学习课程课件",
    description: "机器学习导论课件已完成征集。",
    status: "completed",
    course: 2,
    type: 2,
  },
  {
    title: "征集计算机网络习题",
    description: "本轮习题征集已关闭。",
    status: "closed",
    course: 3,
    type: 3,
  },
];

export const requestItems: RequestItem[] = requestSamples.map(
  (sample, index) => {
    const course = courses[sample.course];
    return {
      id: `request-${index + 1}`,
      archive_code: `REQ-${String(index + 1).padStart(3, "0")}`,
      title: sample.title,
      description: sample.description,
      status: sample.status,
      colleges: catalog.colleges.filter((college) =>
        course.college_ids.includes(college.id),
      ),
      course,
      resource_type: catalog.resource_types[sample.type],
      grades: [],
      semester: null,
      year: null,
      submission_count: 0,
      created_at: time,
      updated_at: time,
    };
  },
);

const config = {
  max_file_size_bytes: 25 * 1024 * 1024,
  max_attachments: 5,
  allowed_extensions: ["pdf", "png", "jpg", "jpeg"],
};
const formats: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
type LocalUpload = {
  owner: string;
  metadata: UploadInit;
  contentType: string;
  expires: number;
  blob?: Blob;
  checkedAt?: number;
  used?: boolean;
  url?: string;
};
const uploads = new Map<string, LocalUpload>();
const submissions = new Map<string, ResourceDetail>();

function state(id: string, upload: LocalUpload): UploadState {
  const status =
    upload.checkedAt === undefined
      ? "uploading"
      : Date.now() < upload.checkedAt
        ? "checking"
        : "ready";
  return {
    upload_id: id,
    status,
    filename: upload.metadata.filename,
    file_id: status === "ready" ? id : null,
    reason: null,
  };
}

export function uploadedFileUrl(id: string) {
  const entry = uploads.get(id);
  if (!entry?.used || !entry.blob) return null;
  entry.url ??= URL.createObjectURL(entry.blob);
  return entry.url;
}

export const submissionHandlers = [
  http.get(`${base}/requests`, ({ request }) => {
    if (!sessionEmail()) return denied();
    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "open";
    const keyword = (params.get("keyword") ?? "").trim().toLowerCase();
    const colleges = params.getAll("college_ids");
    return ok(
      paginate(
        requestItems.filter(
          (item) =>
            item.status === status &&
            [
              item.title,
              item.course?.name ?? "",
              ...item.colleges.map((college) => college.name),
            ].some((field) => field.toLowerCase().includes(keyword)) &&
            (!colleges.length ||
              item.colleges.some((college) => colleges.includes(college.id))),
        ),
        params,
      ),
    );
  }),
  http.get(`${base}/requests/:id`, ({ params }) => {
    if (!sessionEmail()) return denied();
    const item = requestItems.find((item) => item.id === params.id);
    return item ? ok(item) : missing();
  }),
  http.get(`${base}/uploads/config`, () =>
    sessionEmail() ? ok(config) : denied(),
  ),
  http.post(`${base}/uploads/presign`, async ({ request }) => {
    const owner = sessionEmail();
    if (!owner) return denied();
    const metadata = (await request.json()) as UploadInit;
    const contentType =
      formats[metadata.filename?.split(".").pop()?.toLowerCase() ?? ""];
    if (!contentType)
      return problem(415, "UNSUPPORTED_FILE_TYPE", "当前格式不支持上传。");
    if (
      !metadata.size_bytes ||
      metadata.size_bytes > config.max_file_size_bytes
    )
      return problem(413, "FILE_TOO_LARGE", "文件为空或超过大小限制。");
    const id = crypto.randomUUID();
    const expires = Date.now() + 5 * 60_000;
    uploads.set(id, { owner, metadata, contentType, expires });
    return ok({
      upload_id: id,
      method: "PUT",
      url: new URL(`${base}/mock-transfer/${id}`, window.location.origin).href,
      headers: {},
      expires_at: new Date(expires).toISOString(),
    });
  }),
  http.put(`${base}/mock-transfer/:id`, async ({ params, request }) => {
    const upload = uploads.get(String(params.id));
    if (!upload || upload.owner !== sessionEmail())
      return new HttpResponse(null, { status: 404 });
    if (upload.expires <= Date.now() || upload.checkedAt !== undefined)
      return new HttpResponse(null, { status: 403 });
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== upload.metadata.size_bytes)
      return new HttpResponse(null, { status: 400 });
    upload.blob = new Blob([bytes], { type: upload.contentType });
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${base}/uploads/:id/complete`, ({ params }) => {
    const id = String(params.id);
    const upload = uploads.get(id);
    if (!sessionEmail()) return denied();
    if (!upload || upload.owner !== sessionEmail()) return missing();
    if (!upload.blob)
      return problem(409, "UPLOAD_NOT_READY", "附件尚未传输完成。");
    upload.checkedAt ??= Date.now() + 450;
    return ok(state(id, upload));
  }),
  http.get(`${base}/uploads/:id`, ({ params }) => {
    const id = String(params.id);
    const upload = uploads.get(id);
    if (!sessionEmail()) return denied();
    return upload?.owner === sessionEmail() && upload
      ? ok(state(id, upload))
      : missing();
  }),
  http.delete(`${base}/uploads/:id`, ({ params }) => {
    const id = String(params.id);
    const upload = uploads.get(id);
    if (!sessionEmail()) return denied();
    if (!upload || upload.owner !== sessionEmail()) return missing();
    if (upload.used)
      return problem(409, "STATE_CONFLICT", "已关联资料的附件不能在此移除。");
    uploads.delete(id);
    return ok(null);
  }),
  http.post(`${base}/resources`, async ({ request }) => {
    const email = sessionEmail();
    if (!email) return denied();
    const body = (await request.json()) as CreateResource;
    const token = request.headers.get("Idempotency-Key");
    const submissionKey = token ? JSON.stringify([email, token]) : undefined;
    const existing = submissionKey && submissions.get(submissionKey);
    if (existing) return ok(existing, 201);
    const title = body.title?.trim();
    const colleges = catalog.colleges.filter((item) =>
      body.college_ids?.includes(item.id),
    );
    const course = courses.find((item) => item.id === body.course_id);
    const type = catalog.resource_types.find(
      (item) => item.id === body.type_id,
    );
    if (
      !title ||
      title.length > 200 ||
      !colleges.length ||
      !course ||
      !type ||
      !colleges.some((item) => course.college_ids.includes(item.id)) ||
      body.share_confirmed !== true
    ) {
      return problem(
        422,
        "VALIDATION_ERROR",
        "请确认标题、分类和资料分享权限。",
      );
    }
    const associated = requestItems.find((item) => item.id === body.request_id);
    if (body.request_id && associated?.status !== "open")
      return problem(409, "REQUEST_CLOSED", "此征集已结束，无法提交响应。");
    const fileIds = [...new Set(body.file_ids ?? [])];
    if (!fileIds.length || fileIds.length > config.max_attachments)
      return problem(422, "VALIDATION_ERROR", "请添加有效的附件。");
    const attachments: Attachment[] = [];
    for (const id of fileIds) {
      const entry = uploads.get(id);
      if (
        !entry ||
        entry.owner !== email ||
        entry.used ||
        state(id, entry).status !== "ready"
      )
        return problem(
          409,
          "UPLOAD_NOT_READY",
          "有附件尚未通过检查或无法关联。",
        );
      attachments.push({
        id,
        filename: entry.metadata.filename,
        content_type: entry.contentType,
        size_bytes: entry.metadata.size_bytes,
        preview_supported: true,
      });
    }
    const timestamp = new Date().toISOString();
    const item: ResourceDetail = {
      id: crypto.randomUUID(),
      archive_code: `ARC-${String(resources.length + 1).padStart(3, "0")}`,
      title,
      colleges,
      course,
      resource_type: type,
      grades: body.grades,
      semester: body.semester,
      year: body.year,
      source: body.source,
      version: body.version,
      description: body.description,
      request_id: body.request_id,
      files: attachments,
      file_count: attachments.length,
      download_count: 0,
      review_status: "pending",
      safety_status: "passed",
      visibility: "published",
      created_at: timestamp,
      updated_at: timestamp,
    };
    for (const id of fileIds) uploads.get(id)!.used = true;
    resources.unshift(item);
    if (associated) associated.submission_count++;
    if (submissionKey) submissions.set(submissionKey, item);
    return ok(item, 201);
  }),
];
