import { Link2, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { ResourceSummary } from "../api/types";
import {
  archiveCode,
  formatFileSize,
  resourcePath,
  resourceShareUrl,
  reviewLabels,
  semesterLabels,
} from "../api/resourcePresentation";
import { DownloadButton } from "./DownloadButton";

const archiveDate = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai",
});

export function Brand({
  variant = "masthead",
}: {
  variant?: "masthead" | "login";
}) {
  const isLogin = variant === "login";
  return (
    <Link
      to="/"
      className={isLogin ? "brand login-brand" : "brand masthead-brand"}
    >
      <img
        className="brand-mark"
        src={`${import.meta.env.BASE_URL}yixue-icon.svg`}
        width={32}
        height={32}
        alt=""
      />
      <span>逸学</span>
      <span
        className={isLogin ? "login-brand-edition" : "brand-edition"}
        aria-hidden="true"
      >
        {isLogin ? "ARCHIVE" : "SYSU ARCHIVE"}
      </span>
    </Link>
  );
}

export function SearchBox({
  initialValue = "",
  label = "检索课程或资料",
  placeholder = "检索课程名或资料关键词…",
  onSearch,
  onChange,
}: {
  initialValue?: string;
  label?: string;
  placeholder?: string;
  onSearch: (keyword: string) => void;
  onChange?: (keyword: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current && input.current.value !== initialValue)
      input.current.value = initialValue;
  }, [initialValue]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(
      String(new FormData(event.currentTarget).get("keyword") ?? "").trim(),
    );
  }

  return (
    <form className="search-box" role="search" onSubmit={submit}>
      <Search size={20} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        name="keyword"
        defaultValue={initialValue}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      <button className="button primary" type="submit">
        检索
      </button>
    </form>
  );
}

export function Message({
  title,
  action,
  busy = false,
}: {
  title: string;
  action?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="message" role={busy ? "status" : undefined}>
      <p>{title}</p>
      {action}
    </div>
  );
}

export function ResourceList({
  items,
  catalog = false,
}: {
  items: ResourceSummary[];
  catalog?: boolean;
}) {
  const [feedback, setFeedback] = useState<{ message: string }>();
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(undefined), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(resourceShareUrl(id));
      setFeedback({ message: "已复制逸学分享链接" });
    } catch {
      setFeedback({ message: "请到资料详情页手动复制链接。" });
    }
  }

  return (
    <>
      <ul
        className={
          catalog ? "resource-list archive-list" : "resource-list recent-list"
        }
      >
        {items.map((item) => {
          const path = resourcePath(item.id);
          const code = archiveCode(item);
          const previewFiles = item.files.filter(
            (file) => file.preview_supported,
          );
          const attachmentsPath = `${path}#resource-attachments`;
          const previewPath =
            previewFiles.length === 1
              ? `${path}/preview/${encodeURIComponent(previewFiles[0].id)}`
              : attachmentsPath;
          const downloadFiles = item.files.filter(
            (file) => file.download_supported !== false,
          );
          const formats = Array.from(
            new Set(
              item.files
                .map((file) =>
                  file.filename
                    .match(/\.([a-z0-9]{1,6})$/i)?.[1]
                    ?.toUpperCase(),
                )
                .filter(Boolean),
            ),
          );
          const period = [
            item.year,
            item.semester && semesterLabels[item.semester],
          ]
            .filter(Boolean)
            .join(" ");
          const fileCount = `${item.file_count} 个附件`;
          const totalBytes = item.files.reduce(
            (total, file) => total + file.size_bytes,
            0,
          );
          const fileActions = (
            <>
              {previewFiles.length > 0 && (
                <Link className="button" to={previewPath}>
                  在线阅读
                </Link>
              )}
              {downloadFiles.length === 1 && (
                <DownloadButton
                  resourceId={item.id}
                  fileId={downloadFiles[0].id}
                />
              )}
              {downloadFiles.length > 1 && (
                <Link
                  className="button ink-button"
                  to={`${path}#resource-attachments`}
                >
                  下载附件
                </Link>
              )}
            </>
          );

          if (!catalog) {
            const created = new Date(item.created_at);
            const date = Number.isNaN(created.getTime())
              ? ""
              : archiveDate.format(created).replace("/", "-");
            return (
              <li className="resource-row recent-resource-row" key={item.id}>
                <div className="resource-text">
                  <p className="recent-record-meta archive-mono">
                    <span className="archive-code" title={code}>
                      {code}
                    </span>
                    {[
                      formats.join(" / "),
                      totalBytes > 0 && formatFileSize(totalBytes),
                      date,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <h3 className="resource-title">
                    <Link to={path}>{item.title}</Link>
                  </h3>
                  <p className="resource-meta">
                    {[item.course.name, item.resource_type.name]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {previewFiles.length > 0 ? (
                  <Link
                    className="button recent-resource-action"
                    to={previewPath}
                  >
                    在线阅读
                  </Link>
                ) : downloadFiles.length > 0 ? (
                  <Link
                    className="button recent-resource-action"
                    to={attachmentsPath}
                  >
                    查看附件
                  </Link>
                ) : null}
              </li>
            );
          }

          const metadata = [
            item.colleges.map(({ name }) => name).join("、"),
            item.course.name,
            period,
            item.file_count > 0 && totalBytes
              ? `${fileCount}（${formatFileSize(totalBytes)}）`
              : fileCount,
            `${item.download_count} 次下载请求`,
          ];
          return (
            <li className="resource-row" key={item.id}>
              <span className="archive-code" title={code}>
                {code}
              </span>
              <div className="resource-text">
                <div className="archive-title-line">
                  <h3 className="resource-title">
                    <Link to={path}>{item.title}</Link>
                  </h3>
                  {formats.length > 0 && (
                    <span className="file-format">{formats.join(" / ")}</span>
                  )}
                </div>
                <p className="resource-meta">
                  {metadata.filter(Boolean).join(" · ")} ·{" "}
                  <span
                    className={
                      item.review_status === "approved"
                        ? "review-approved"
                        : undefined
                    }
                  >
                    {reviewLabels[item.review_status]}
                  </span>
                </p>
              </div>
              <div className="archive-actions">
                {fileActions}
                <button
                  type="button"
                  className="button icon-button"
                  aria-label={`复制「${item.title}」的分享链接`}
                  title="复制链接"
                  onClick={() => void copy(item.id)}
                >
                  <Link2 size={17} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {feedback && (
        <div className="archive-toast" role="status">
          {feedback.message}
        </div>
      )}
    </>
  );
}
