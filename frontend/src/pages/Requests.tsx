import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { requestDetailsQuery, requestsQuery } from "../api/queries";
import type { RequestStatus } from "../api/types";
import { Message } from "../components/ui";

const statuses: Record<RequestStatus, string> = {
  open: "征集中",
  completed: "已完成",
  closed: "已关闭",
};

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const chosen = params.get("status");
  const status =
    chosen === "completed" || chosen === "closed" ? chosen : "open";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const result = useQuery(
    requestsQuery(
      new URLSearchParams({ status, page: String(page) }).toString(),
    ),
  );
  return (
    <section className="standard-page">
      <h1>资料征集</h1>
      <div className="request-tabs" aria-label="征集状态筛选">
        {(Object.entries(statuses) as [RequestStatus, string][]).map(
          ([key, label]) => (
            <button
              key={key}
              type="button"
              className={key === status ? "button primary" : "button"}
              aria-pressed={key === status}
              onClick={() => setParams(key === "open" ? {} : { status: key })}
            >
              {label}
            </button>
          ),
        )}
      </div>
      {result.isPending && <Message title="正在加载征集…" busy />}
      {result.isError && (
        <Message
          title="征集加载失败"
          action={
            <button className="button" onClick={() => void result.refetch()}>
              重试
            </button>
          }
        />
      )}
      {result.data &&
        (result.data.items.length ? (
          <ul className="panel requests-list">
            {result.data.items.map((item) => (
              <li key={item.id}>
                <Link to={`/requests/${encodeURIComponent(item.id)}`}>
                  <div>
                    <h2>{item.title}</h2>
                    <p className="muted">
                      {[
                        item.course?.name,
                        item.resource_type?.name,
                        `${item.submission_count} 份响应`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="type-label">{statuses[item.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel">
            <Message title="当前没有这个状态的征集。" />
          </div>
        ))}
      {result.data &&
        (page > 1 || result.data.total > result.data.page_size) && (
          <nav className="pagination" aria-label="征集分页">
            <button
              className="button"
              disabled={page <= 1}
              onClick={() => setParams({ status, page: String(page - 1) })}
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              className="button"
              disabled={page * result.data.page_size >= result.data.total}
              onClick={() => setParams({ status, page: String(page + 1) })}
            >
              下一页
            </button>
          </nav>
        )}
    </section>
  );
}

export function RequestDetails() {
  const { id = "" } = useParams();
  const result = useQuery(requestDetailsQuery(id));
  if (result.isPending) return <Message title="正在加载征集…" busy />;
  if (result.isError)
    return (
      <Message
        title={result.error.message}
        action={
          <Link to="/requests" className="button">
            返回资料征集
          </Link>
        }
      />
    );
  const item = result.data;
  return (
    <article className="standard-page detail-page flow-page">
      <Link to="/requests" className="text-link">
        返回资料征集
      </Link>
      <h1>{item.title}</h1>
      <span className="type-label">{statuses[item.status]}</span>
      <dl className="detail-fields">
        <div>
          <dt>课程</dt>
          <dd>{item.course?.name ?? "不限"}</dd>
        </div>
        <div>
          <dt>资料类型</dt>
          <dd>{item.resource_type?.name ?? "不限"}</dd>
        </div>
        <div>
          <dt>学院</dt>
          <dd>
            {item.colleges.map((college) => college.name).join("、") || "不限"}
          </dd>
        </div>
        <div>
          <dt>收到的响应</dt>
          <dd>{item.submission_count} 份</dd>
        </div>
      </dl>
      <p className="detail-description">{item.description}</p>
      {item.status === "open" && (
        <Link
          className="button primary flow-action"
          to={`/upload?${new URLSearchParams({ request_id: item.id })}`}
        >
          响应征集
        </Link>
      )}
    </article>
  );
}
