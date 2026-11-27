import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { authHandlers, role } from "./auth";
import { catalog, courses, localPdfFiles, resources } from "./fixtures";
import { base, denied, missing, ok, paginate } from "./responses";
import {
  requestItems,
  submissionHandlers,
  uploadedFileUrl,
} from "./submissions";

function fileAccess(
  fileId: string,
  resourceId: string | null,
  download = false,
) {
  if (!role()) return denied();
  const resource = resources.find(
    (item) =>
      item.id === resourceId &&
      item.visibility === "published" &&
      item.safety_status === "passed",
  );
  const attachment = resource?.files.find((item) => item.id === fileId);
  if (!attachment) return missing();
  const file = localPdfFiles.get(attachment.id);
  const url = file
    ? new URL(
        `${file.url}${download ? "?download=1" : ""}`,
        window.location.origin,
      ).href
    : uploadedFileUrl(fileId);
  if (!url)
    return HttpResponse.json(
      {
        code: "NOT_FOUND",
        message: "这份演示资料没有可打开的测试文件。",
        data: null,
      },
      { status: 404 },
    );
  return HttpResponse.json(
    {
      code: "OK",
      message: "success",
      data: {
        url,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        filename: attachment.filename,
        content_type: attachment.content_type,
        size_bytes: attachment.size_bytes,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const worker = setupWorker(
  ...authHandlers,
  ...submissionHandlers,
  http.get(`${base}/catalog`, () => (role() ? ok(catalog) : denied())),
  http.get(`${base}/courses`, ({ request }) => {
    if (!role()) return denied();
    const params = new URL(request.url).searchParams;
    const keyword = (params.get("keyword") ?? "").trim().toLowerCase();
    const colleges = params.getAll("college_ids");
    const items = courses.filter(
      (item) =>
        (!colleges.length ||
          item.college_ids.some((id) => colleges.includes(id))) &&
        [item.name, ...item.aliases].some((name) =>
          name.toLowerCase().includes(keyword),
        ),
    );
    return ok(paginate(items, params));
  }),
  http.get(`${base}/courses/:id`, ({ params }) => {
    if (!role()) return denied();
    const item = courses.find((course) => course.id === params.id);
    return item ? ok(item) : missing();
  }),
  http.get(`${base}/resources`, ({ request }) => {
    if (!role()) return denied();
    const params = new URL(request.url).searchParams;
    const keyword = (params.get("keyword") ?? "").trim().toLowerCase();
    function matches(key: string, values: string[]) {
      const filter = params.getAll(key);
      return !filter.length || filter.some((value) => values.includes(value));
    }
    const items = resources.filter((item) => {
      const aliases =
        courses.find((course) => course.id === item.course.id)?.aliases ?? [];
      return (
        [item.title, item.course.name, ...aliases].some((value) =>
          value.toLowerCase().includes(keyword),
        ) &&
        matches(
          "college_ids",
          item.colleges.map((college) => college.id),
        ) &&
        matches("course_ids", [item.course.id]) &&
        matches("type_ids", [item.resource_type.id]) &&
        matches("grades", item.grades.map(String)) &&
        matches("semesters", item.semester ? [item.semester] : []) &&
        matches("years", item.year === null ? [] : [String(item.year)])
      );
    });
    const sort = params.get("sort");
    if (sort === "year_desc")
      items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    if (sort === "popular")
      items.sort((a, b) => b.download_count - a.download_count);
    return ok(paginate(items, params));
  }),
  http.get(`${base}/resources/:id`, ({ params }) => {
    if (!role()) return denied();
    const item = resources.find((resource) => resource.id === params.id);
    return item ? ok(item) : missing();
  }),
  http.get(`${base}/files/:id/preview`, ({ params, request }) =>
    fileAccess(
      String(params.id),
      new URL(request.url).searchParams.get("resource_id"),
    ),
  ),
  http.post(`${base}/files/:id/download`, async ({ params, request }) => {
    if (!role()) return denied();
    const body = (await request.json()) as { resource_id?: string };
    return fileAccess(String(params.id), body.resource_id ?? null, true);
  }),
  http.get(`${base}/admin/dashboard`, () => {
    const currentRole = role();
    if (!currentRole) return denied();
    if (currentRole !== "admin")
      return HttpResponse.json(
        { code: "FORBIDDEN", message: "需要管理员权限。", data: null },
        { status: 403 },
      );
    return ok({
      resource_count: resources.length,
      pending_count: resources.filter(
        (item) => item.review_status === "pending",
      ).length,
      open_request_count: requestItems.filter((item) => item.status === "open")
        .length,
    });
  }),
);

export function startMocks() {
  return worker.start({ onUnhandledRequest: "bypass" });
}
