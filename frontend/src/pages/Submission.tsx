import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { catalogQuery, requestDetailsQuery } from "../api/queries";
import type {
  Catalog,
  CreateResource,
  Grade,
  RequestItem,
  Semester,
  UploadConfig,
} from "../api/types";
import { uploadAttachment } from "../api/upload";
import { Message } from "../components/ui";

type QueueItem = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "checking" | "ready" | "failed";
  fileId?: string;
  uploadId?: string;
  error?: string;
};

function displaySize(bytes: number) {
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(bytes >= 1048576 ? bytes / 1048576 : bytes / 1024)} ${bytes >= 1048576 ? "MB" : "KB"}`;
}

const statuses = {
  queued: "排队中",
  uploading: "上传中",
  checking: "正在检查",
  ready: "已通过检查",
  failed: "上传失败",
};

export default function Submission() {
  const [params] = useSearchParams();
  const requestId = params.get("request_id") ?? "";
  const catalog = useQuery(catalogQuery);
  const gathering = useQuery(requestDetailsQuery(requestId));
  const config = useQuery({
    queryKey: ["uploads-config"],
    queryFn: ({ signal }) => api.uploadConfig(signal),
  });

  return (
    <section className="standard-page submission-page">
      <h1>我要投稿</h1>
      {catalog.isError || config.isError ? (
        <Message
          title="投稿配置加载失败。"
          action={
            <button
              className="button"
              onClick={() => {
                void catalog.refetch();
                void config.refetch();
              }}
            >
              重试
            </button>
          }
        />
      ) : requestId && gathering.isError ? (
        <Message
          title="无法打开这条征集。"
          action={
            <Link className="button" to="/upload">
              改为普通投稿
            </Link>
          }
        />
      ) : !catalog.data || !config.data || (requestId && !gathering.data) ? (
        <Message title="正在加载投稿表单…" busy />
      ) : (
        <SubmissionForm
          key={requestId}
          catalog={catalog.data}
          config={config.data}
          requestItem={gathering.data}
        />
      )}
    </section>
  );
}

function SubmissionForm({
  catalog,
  config,
  requestItem,
}: {
  catalog: Catalog;
  config: UploadConfig;
  requestItem?: RequestItem;
}) {
  const queryClient = useQueryClient();
  const [linked, setLinked] = useState(Boolean(requestItem));
  const [colleges, setColleges] = useState(
    requestItem?.colleges.map((item) => item.id) ?? [],
  );
  const [courseId, setCourseId] = useState(requestItem?.course?.id ?? "");
  const [courseKeyword, setCourseKeyword] = useState("");
  const [files, setFiles] = useState<QueueItem[]>([]);
  const [notice, setNotice] = useState("");
  const transfers = useRef(new Map<string, AbortController>());
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const encoded = new URLSearchParams({ page_size: "100" });
  for (const id of colleges) encoded.append("college_ids", id);
  if (courseKeyword) encoded.set("keyword", courseKeyword);
  const query = encoded.toString();
  const courses = useQuery({
    queryKey: ["courses", query],
    queryFn: ({ signal }) => api.courses(query, signal),
    staleTime: 60000,
  });
  const currentCourse = useQuery({
    queryKey: ["course", courseId],
    queryFn: ({ signal }) => api.course(courseId, signal),
    enabled: Boolean(courseId),
    staleTime: 60000,
  });
  const submit = useMutation({
    mutationFn: (input: { fields: CreateResource; key: string }) =>
      api.createResource(input.fields, input.key),
    onSuccess: (resource) => {
      queryClient.setQueryData(["resource", resource.id], resource);
      for (const key of ["resources", "requests", "request", "admin"])
        void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  useEffect(() => {
    const active = transfers.current;
    const pending = files.filter(
      (item) => item.status === "queued" && !active.has(item.id),
    );
    for (const item of pending.slice(0, Math.max(0, 3 - active.size))) {
      const controller = new AbortController();
      active.set(item.id, controller);
      const update = (patch: Partial<QueueItem>) =>
        setFiles((list) =>
          list.map((entry) =>
            entry.id === item.id ? { ...entry, ...patch } : entry,
          ),
        );
      void uploadAttachment(
        item.file,
        controller.signal,
        (progress) => update({ status: "uploading", progress }),
        () => update({ status: "checking", progress: 100 }),
      )
        .then((result) => {
          active.delete(item.id);
          update({ ...result, status: "ready", progress: 100 });
        })
        .catch((error: unknown) => {
          active.delete(item.id);
          update(
            controller.signal.aborted
              ? {}
              : {
                  status: "failed",
                  error:
                    error instanceof Error
                      ? error.message
                      : "上传失败，请重试。",
                },
          );
        });
    }
  }, [files]);

  useEffect(() => {
    const active = transfers.current;
    return () => {
      for (const controller of active.values()) controller.abort();
    };
  }, []);

  function addFiles(selected: File[]) {
    const accepted: QueueItem[] = [];
    const rejected: string[] = [];
    const allowed = config.allowed_extensions.map((extension) =>
      extension.toLowerCase().replace(/^\./, ""),
    );
    for (const file of selected) {
      const extension = file.name.includes(".")
        ? file.name.split(".").pop()!.toLowerCase()
        : "";
      if (!allowed.includes(extension))
        rejected.push(`${file.name} 的格式不支持`);
      else if (!file.size || file.size > config.max_file_size_bytes)
        rejected.push(`${file.name} 为空或超过大小限制`);
      else if (files.length + accepted.length >= config.max_attachments)
        rejected.push(`${file.name} 超出附件数量限制`);
      else if (
        ![...files, ...accepted].some(
          (item) =>
            item.file.name === file.name &&
            item.file.size === file.size &&
            item.file.lastModified === file.lastModified,
        )
      )
        accepted.push({
          id: crypto.randomUUID(),
          file,
          status: "queued",
          progress: 0,
        });
    }
    setFiles((items) => [...items, ...accepted]);
    setNotice(rejected.join("。"));
  }

  function removeFile(item: QueueItem) {
    transfers.current.get(item.id)?.abort();
    if (item.uploadId)
      void api.cancelUpload(item.uploadId).catch(() => undefined);
    setFiles((items) => items.filter(({ id }) => id !== item.id));
  }

  function changeColleges(id: string) {
    const next = colleges.includes(id)
      ? colleges.filter((item) => item !== id)
      : [...colleges, id];
    setColleges(next);
    const selected =
      currentCourse.data ??
      courses.data?.items.find((course) => course.id === courseId);
    if (selected && !selected.college_ids.some((item) => next.includes(item)))
      setCourseId("");
  }

  const validFiles =
    files.length > 0 &&
    files.every((item) => item.status === "ready" && item.fileId);
  const closed = linked && requestItem?.status !== "open";
  const courseOptions = courses.data?.items ?? [];
  const selectedCourse = currentCourse.data ?? requestItem?.course;
  const offeredCourses =
    selectedCourse?.id === courseId &&
    !courseOptions.some((item) => item.id === courseId)
      ? [selectedCourse, ...courseOptions]
      : courseOptions;

  if (submit.data)
    return (
      <div className="panel success-panel" role="status">
        <h2>
          {submit.data.visibility === "published"
            ? submit.data.review_status === "pending"
              ? "已发布，待审核"
              : "投稿已发布"
            : "投稿已提交"}
        </h2>
        <p>{submit.data.title}</p>
        {submit.data.visibility === "published" && (
          <Link
            className="button primary"
            to={`/resources/${encodeURIComponent(submit.data.id)}`}
          >
            查看资料
          </Link>
        )}
        {linked && requestItem && (
          <Link
            className="button"
            to={`/requests/${encodeURIComponent(requestItem.id)}`}
          >
            返回征集
          </Link>
        )}
      </div>
    );

  return (
    <form
      className="panel submission-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (submit.isPending || !validFiles || closed) return;
        const data = new FormData(event.currentTarget);
        const value = (key: string) => String(data.get(key) ?? "").trim();
        if (
          !colleges.length ||
          !courseId ||
          !value("title") ||
          !data.has("confirmed")
        ) {
          setNotice("请填写标题、选择学院和课程，并确认分享权限。");
          return;
        }
        setNotice("");
        const fields: CreateResource = {
          title: value("title"),
          college_ids: colleges,
          course_id: courseId,
          type_id: value("type"),
          grades: data.getAll("grades").map((item) => Number(item) as Grade),
          semester: (value("semester") || null) as Semester | null,
          year: Number(value("year")) || null,
          source: value("source") || null,
          version: value("version") || null,
          description: value("description") || null,
          file_ids: files.map((item) => item.fileId!),
          request_id: linked ? (requestItem?.id ?? null) : null,
          share_confirmed: true,
        };
        const fingerprint = JSON.stringify(fields);
        if (requestKey.current?.fingerprint !== fingerprint)
          requestKey.current = { fingerprint, key: crypto.randomUUID() };
        submit.mutate({ fields, key: requestKey.current.key });
      }}
    >
      {linked && requestItem && (
        <div className="request-banner">
          <p>{closed ? "此征集已结束" : `响应征集 · ${requestItem.title}`}</p>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setLinked(false);
              submit.reset();
            }}
          >
            改为普通投稿
          </button>
        </div>
      )}
      <fieldset className="form-grid" disabled={submit.isPending}>
        <label className="form-field full-field">
          资料标题
          <input
            name="title"
            className="field"
            required
            maxLength={200}
            placeholder="例如 数据结构 2025 年期末真题"
          />
        </label>
        <fieldset className="check-group full-field">
          <legend>适用学院（至少一项）</legend>
          {catalog.colleges.map((college) => (
            <label key={college.id}>
              <input
                type="checkbox"
                checked={colleges.includes(college.id)}
                onChange={() => changeColleges(college.id)}
              />
              {college.name}
            </label>
          ))}
        </fieldset>
        <div className="form-field">
          <label htmlFor="submission-course">课程</label>
          <input
            className="field"
            type="search"
            aria-label="查找课程"
            placeholder="输入课程关键词"
            value={courseKeyword}
            onChange={(event) => setCourseKeyword(event.target.value)}
          />
          <select
            id="submission-course"
            className="field"
            required
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            <option value="">
              {courses.isPending ? "正在加载课程…" : "选择课程"}
            </option>
            {offeredCourses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          {courses.isError && (
            <button
              type="button"
              className="text-link"
              onClick={() => void courses.refetch()}
            >
              课程加载失败，重试
            </button>
          )}
        </div>
        <label className="form-field">
          资料类型
          <select
            name="type"
            className="field"
            required
            defaultValue={requestItem?.resource_type?.id ?? ""}
          >
            <option value="">选择资料类型</option>
            {catalog.resource_types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="check-group full-field">
          <legend>适用年级</legend>
          {catalog.grades.map((grade) => (
            <label key={grade.value}>
              <input
                type="checkbox"
                name="grades"
                value={grade.value}
                defaultChecked={requestItem?.grades.includes(grade.value)}
              />
              {grade.label}
            </label>
          ))}
        </fieldset>
        <label className="form-field">
          学期
          <select
            name="semester"
            className="field"
            defaultValue={requestItem?.semester ?? ""}
          >
            <option value="">未标注</option>
            {catalog.semesters.map((term) => (
              <option key={term.value} value={term.value}>
                {term.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          资料年份
          <input
            name="year"
            className="field"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            defaultValue={requestItem?.year ?? ""}
          />
        </label>
        <label className="form-field">
          来源
          <input name="source" className="field" />
        </label>
        <label className="form-field">
          版本
          <input name="version" className="field" />
        </label>
        <label className="form-field full-field">
          资料说明
          <textarea name="description" className="field" rows={3} />
        </label>
        <section className="full-field" aria-labelledby="submission-files">
          <h2 id="submission-files">附件</h2>
          <label
            className="drop-area"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!submit.isPending)
                addFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <Upload size={20} aria-hidden="true" />
            <span>选择文件或拖到此处</span>
            <small>
              {config.allowed_extensions.join("、").toUpperCase()} · 每份最多{" "}
              {config.max_attachments} 个附件 · 单个最大{" "}
              {displaySize(config.max_file_size_bytes)}
            </small>
            <input
              type="file"
              multiple
              aria-label="选择附件"
              accept={config.allowed_extensions
                .map((item) => (item.startsWith(".") ? item : `.${item}`))
                .join(",")}
              onChange={(event) => {
                addFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
          </label>
          <ul className="upload-queue" aria-label="附件上传列表">
            {files.map((item) => (
              <li key={item.id}>
                <FileText size={19} aria-hidden="true" />
                <div className="file-info">
                  <span>{item.file.name}</span>
                  <span className="muted">
                    {displaySize(item.file.size)} · {statuses[item.status]}
                    {item.status === "uploading" && ` ${item.progress}%`}
                  </span>
                  {item.error && (
                    <span className="error-text">{item.error}</span>
                  )}
                </div>
                <div className="file-actions">
                  {item.status === "failed" && (
                    <button
                      type="button"
                      className="button"
                      onClick={() =>
                        setFiles((list) =>
                          list.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  status: "queued",
                                  progress: 0,
                                  error: undefined,
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      重试
                    </button>
                  )}
                  <button
                    type="button"
                    className="button"
                    onClick={() => removeFile(item)}
                    aria-label={`移除 ${item.file.name}`}
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <label className="confirm-sharing full-field">
          <input type="checkbox" name="confirmed" required />
          我确认有权分享这些资料，并同意向已登录用户公开。
        </label>
      </fieldset>
      {notice && (
        <p role="alert" className="error-text">
          {notice}
        </p>
      )}
      {submit.error && (
        <p role="alert" className="error-text">
          {submit.error.message}
          {submit.error instanceof ApiError &&
            submit.error.code === "REQUEST_CLOSED" &&
            " 可改为普通投稿，当前填写内容会保留。"}
        </p>
      )}
      <button
        type="submit"
        className="button primary"
        disabled={!validFiles || closed || submit.isPending}
      >
        {submit.isPending ? "正在提交…" : "提交投稿"}
      </button>
    </form>
  );
}
