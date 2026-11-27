import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  catalogQuery,
  requestDetailsQuery,
  requestsQuery,
} from "../api/queries";
import type { RequestItem, RequestStatus } from "../api/types";
import { Message, SearchBox } from "../components/ui";

const statuses = {
  open: "征集中",
  completed: "已完成",
  closed: "已关闭",
} satisfies Record<RequestStatus, string>;
const statusKeys = Object.keys(statuses) as RequestStatus[];
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function requestPath(id: string) {
  return `/requests/${encodeURIComponent(id)}`;
}

function responsePath(id: string) {
  return `/upload?${new URLSearchParams({ request_id: id })}`;
}

function RequestBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`type-label request-badge request-badge-${status}`}>
      {statuses[status]}
    </span>
  );
}

function RequestRow({ item }: { item: RequestItem }) {
  const timestamp = new Date(item.created_at);
  return (
    <li className="resource-row request-row">
      <span className="archive-code" title={item.archive_code || item.id}>
        {item.archive_code || item.id}
      </span>
      <div className="resource-text">
        <div className="archive-title-line">
          <h3 className="resource-title">
            <Link to={requestPath(item.id)}>{item.title}</Link>
          </h3>
          <RequestBadge status={item.status} />
        </div>
        {item.description && (
          <p className="request-excerpt">{item.description}</p>
        )}
        <p className="resource-meta request-meta">
          {[
            item.colleges.map(({ name }) => name).join("、"),
            item.course?.name,
            item.resource_type?.name,
            !Number.isNaN(timestamp.getTime()) &&
              `发布于 ${dateFormat.format(timestamp)}`,
            `${item.submission_count} 份响应`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="archive-actions">
        <Link className="button" to={requestPath(item.id)}>
          查看详情
        </Link>
        {item.status === "open" && (
          <Link className="button primary" to={responsePath(item.id)}>
            响应投稿
          </Link>
        )}
      </div>
    </li>
  );
}

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const chosen = params.get("status");
  const status =
    chosen === "completed" || chosen === "closed" ? chosen : "open";
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);
  const catalog = useQuery(catalogQuery);
  const requestParams = new URLSearchParams(params);
  requestParams.set("status", status);
  requestParams.set("page", String(page));
  const result = useQuery(requestsQuery(requestParams.toString()));
  const statusCounts = useQueries({
    queries: statusKeys.map((key) => {
      const countParams = new URLSearchParams(requestParams);
      countParams.delete("page");
      countParams.set("status", key);
      countParams.set("page_size", "1");
      return {
        ...requestsQuery(countParams.toString()),
        enabled: key !== status,
        staleTime: 60_000,
      };
    }),
  });
  const pageCount = result.data
    ? Math.ceil(result.data.total / result.data.page_size)
    : 0;

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    setParams(next, { preventScrollReset: key !== "page" });
  }

  return (
    <section className="standard-page request-page">
      <header className="editorial-header">
        <div>
          <h1>资料征集</h1>
          <p>查看各学院需要补充的资料。响应投稿时会带入关联学院与课程。</p>
        </div>
        <SearchBox
          initialValue={params.get("keyword") ?? ""}
          label="检索征集公告"
          placeholder="检索征集标题、课程或学院…"
          onSearch={(keyword) => changeFilter("keyword", keyword)}
        />
      </header>
      <div className="request-toolbar">
        <div className="request-tabs" aria-label="征集状态筛选">
          {statusKeys.map((key, index) => {
            const total =
              (key === status ? result.data?.total : undefined) ??
              statusCounts[index]?.data?.total;
            return (
              <button
                key={key}
                type="button"
                className={key === status ? "button ink-button" : "button"}
                aria-pressed={key === status}
                onClick={() =>
                  changeFilter("status", key === "open" ? "" : key)
                }
              >
                {statuses[key]}
                {total !== undefined && ` (${total})`}
              </button>
            );
          })}
        </div>
        <div className="request-controls">
          <label htmlFor="request-college" className="request-college-label">
            学院
          </label>
          <select
            id="request-college"
            className="field"
            disabled={!catalog.data}
            aria-label="筛选征集学院"
            value={params.get("college_ids") ?? ""}
            onChange={(event) =>
              changeFilter("college_ids", event.target.value)
            }
          >
            <option value="">全部信息类学院</option>
            {catalog.data?.colleges.map((college) => (
              <option key={college.id} value={college.id}>
                {college.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="panel archive-panel">
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
            <ul
              className="resource-list archive-list"
              aria-label="征集公告列表"
            >
              {result.data.items.map((item) => (
                <RequestRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <Message title="没有符合当前条件的征集。" />
          ))}
      </div>
      {result.data && (page > 1 || pageCount > 1) && (
        <nav className="pagination archive-pagination" aria-label="征集分页">
          <span>
            第 {page} / {Math.max(1, pageCount)} 页
          </span>
          <div>
            <button
              className="button"
              disabled={page <= 1}
              onClick={() => changeFilter("page", String(page - 1))}
            >
              上一页
            </button>
            <button
              className="button"
              disabled={page >= pageCount}
              onClick={() => changeFilter("page", String(page + 1))}
            >
              下一页
            </button>
          </div>
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
      <header className="editorial-header detail-heading">
        <h1>{item.title}</h1>
        <div className="archive-title-line">
          <span className="archive-code">{item.archive_code || item.id}</span>
          <RequestBadge status={item.status} />
        </div>
      </header>
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
          <dt>适用学院</dt>
          <dd>
            {item.colleges.map((college) => college.name).join("、") || "不限"}
          </dd>
        </div>
        <div>
          <dt>收到的响应</dt>
          <dd className="archive-mono">{item.submission_count} 份</dd>
        </div>
      </dl>
      <p className="detail-description">{item.description}</p>
      {item.status === "open" && (
        <Link className="button primary flow-action" to={responsePath(item.id)}>
          响应投稿
        </Link>
      )}
    </article>
  );
}
