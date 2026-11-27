import { useQuery } from "@tanstack/react-query";
import { FileText, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  archiveCode,
  formatFileSize,
  resourcePath,
  resourceShareUrl,
  reviewLabels,
  semesterLabels,
} from "../api/resourcePresentation";
import { Message } from "../components/ui";
import { DownloadButton } from "../components/DownloadButton";

export default function ResourceDetail() {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const attachments = useRef<HTMLElement>(null);
  const [shareFeedback, setShareFeedback] = useState("");
  const details = useQuery({
    queryKey: ["resource", id],
    queryFn: ({ signal }) => api.resource(id, signal),
  });
  const found = details.isSuccess;
  useEffect(() => {
    if (found && hash === "#resource-attachments") {
      attachments.current?.focus({ preventScroll: true });
      attachments.current?.scrollIntoView({ block: "start" });
    }
  }, [found, hash, id]);

  if (details.isPending) return <Message title="正在加载资料详情…" busy />;
  if (details.isError) {
    const missing =
      details.error instanceof ApiError && details.error.status === 404;
    return (
      <Message
        title={missing ? "资料不存在或当前无法访问" : "资料详情加载失败"}
        action={
          missing ? (
            <Link className="button" to="/resources">
              返回资料索引
            </Link>
          ) : (
            <button className="button" onClick={() => void details.refetch()}>
              重试
            </button>
          )
        }
      />
    );
  }

  const item = details.data;
  const path = resourcePath(item.id);
  const shareLink = resourceShareUrl(item.id);
  const fields = [
    ["课程", item.course.name],
    ["适用学院", item.colleges.map((college) => college.name).join("、")],
    [
      "适用年级",
      item.grades
        .map((grade) => ["大一", "大二", "大三", "大四"][grade - 1])
        .join("、"),
    ],
    ["学期", item.semester && semesterLabels[item.semester]],
    ["归档年份", item.year],
    ["来源", item.source],
    ["版本", item.version],
    ["审核状态", reviewLabels[item.review_status]],
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareFeedback("已复制资料链接");
    } catch {
      setShareFeedback("请选中地址并手动复制");
    }
  }

  return (
    <article className="standard-page detail-page">
      <Link to="/resources" className="text-link">
        返回资料索引
      </Link>
      <header className="editorial-header detail-heading">
        <h1>{item.title}</h1>
        <div className="archive-title-line">
          <span className="archive-code">{archiveCode(item)}</span>
          <span className="type-label">{item.resource_type.name}</span>
        </div>
      </header>
      <dl className="detail-fields">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "未标注"}</dd>
          </div>
        ))}
      </dl>
      {item.description && (
        <p className="detail-description">{item.description}</p>
      )}
      <section
        className="detail-section"
        id="resource-attachments"
        ref={attachments}
        tabIndex={-1}
        aria-labelledby="file-heading"
      >
        <h2 id="file-heading">附件</h2>
        <ul className="panel file-list">
          {item.files.map((file) => (
            <li key={file.id}>
              <FileText size={20} aria-hidden="true" />
              <div className="file-info">
                <span>{file.filename}</span>
                <span className="muted archive-mono">
                  {formatFileSize(file.size_bytes)}
                </span>
              </div>
              <div className="file-actions">
                {file.preview_supported && (
                  <Link
                    to={`${path}/preview/${encodeURIComponent(file.id)}`}
                    className="button"
                  >
                    在线阅读
                  </Link>
                )}
                {file.download_supported === false ? (
                  <span className="muted">附件暂不可用</span>
                ) : (
                  <DownloadButton resourceId={item.id} fileId={file.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="detail-section" aria-labelledby="share-heading">
        <h2 id="share-heading">逸学链接</h2>
        <div className="share-row">
          <input
            className="field"
            aria-label="逸学站内分享链接"
            readOnly
            value={shareLink}
            onFocus={(event) => event.target.select()}
          />
          <button
            type="button"
            className="button"
            onClick={() => void copyLink()}
          >
            <Link2 size={17} />
            复制链接
          </button>
        </div>
        {shareFeedback && (
          <p role="status" className="muted">
            {shareFeedback}
          </p>
        )}
      </section>
    </article>
  );
}
