import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { catalogQuery, requestsQuery, resourcesQuery } from "../api/queries";
import bookIllustration from "../assets/home-book.svg";
import { Message, ResourceList, SearchBox } from "../components/ui";

const quickSearches = ["数据结构", "操作系统", "计算机网络", "概率统计"];
const collegeCodes: Record<string, string> = {
  计算机学院: "CSE",
  软件工程学院: "SSE",
  人工智能学院: "AI",
  网络空间安全学院: "SCS",
  智能工程学院: "ISE",
};

function indexPath(filters: Record<string, string> = {}) {
  const params = new URLSearchParams(filters).toString();
  return params ? `/resources?${params}` : "/resources";
}

export default function Home() {
  const navigate = useNavigate();
  const catalog = useQuery(catalogQuery);
  const colleges = catalog.data?.colleges ?? [];
  const collegeCounts = useQueries({
    queries: colleges.map(({ id }) => ({
      ...resourcesQuery(
        new URLSearchParams({ college_ids: id, page_size: "1" }).toString(),
      ),
      staleTime: 60_000,
    })),
  });
  const recent = useQuery(resourcesQuery("sort=latest&page_size=4"));
  const open = useQuery(requestsQuery("status=open&page_size=3"));

  return (
    <div className="home-page">
      <section className="home-search" aria-labelledby="home-search-heading">
        <div className="home-search-content">
          <h1 id="home-search-heading">查找学习资料</h1>
          <p>
            收录中山大学五个信息类学院的历年真题、课程讲义、复习笔记与实验手记。
          </p>
          <SearchBox
            onSearch={(keyword) =>
              navigate(keyword ? indexPath({ keyword }) : indexPath())
            }
          />
          <div className="home-quick-search" aria-label="常用检索">
            <span>常用检索</span>
            {quickSearches.map((keyword) => (
              <Link key={keyword} className="chip" to={indexPath({ keyword })}>
                {keyword}
              </Link>
            ))}
          </div>
        </div>
        <div className="home-search-brand">
          <img src={bookIllustration} width={172} height={86} alt="" />
          <p className="home-motto">
            <span>逸路同行</span> <span>学有所成</span>
          </p>
          <p className="home-brand-caption" lang="en">
            Knowledge lives on.
          </p>
        </div>
      </section>
      <section className="home-section" aria-labelledby="colleges-heading">
        <div className="section-header">
          <h2 id="colleges-heading">学院索引</h2>
          <Link to="/resources" className="text-link">
            进入全部资料索引
          </Link>
        </div>
        {catalog.isPending && <Message title="正在加载学院…" busy />}
        {catalog.isError && (
          <Message
            title="学院加载失败"
            action={
              <button className="button" onClick={() => void catalog.refetch()}>
                重试
              </button>
            }
          />
        )}
        {catalog.isSuccess && colleges.length === 0 && (
          <Message title="暂无学院" />
        )}
        {colleges.length > 0 && (
          <ul className="college-grid">
            {colleges.map((college, index) => {
              const code = collegeCodes[college.name];
              const total = collegeCounts[index]?.data?.total;
              return (
                <li key={college.id}>
                  <Link
                    to={indexPath({ college_ids: college.id })}
                    className="college-link"
                  >
                    <div className="college-label">
                      {code && (
                        <span className="archive-code" aria-hidden="true">
                          {code}
                        </span>
                      )}
                      <span className="college-title">{college.name}</span>
                    </div>
                    <div className="college-meta">
                      <span>
                        {total === undefined ? "查看资料" : `${total} 份资料`}
                      </span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="home-feeds">
        <section className="home-section" aria-labelledby="recent-heading">
          <div className="section-header">
            <h2 id="recent-heading">近期更新</h2>
            <Link to={indexPath()} className="text-link">
              查看全部更新
            </Link>
          </div>
          <div className="panel archive-panel">
            {recent.isPending && <Message title="正在加载资料…" busy />}
            {recent.isError && (
              <Message
                title="资料加载失败"
                action={
                  <button
                    className="button"
                    onClick={() => void recent.refetch()}
                  >
                    重试
                  </button>
                }
              />
            )}
            {recent.data &&
              (recent.data.items.length ? (
                <ResourceList items={recent.data.items} />
              ) : (
                <Message title="暂无近期更新" />
              ))}
          </div>
        </section>
        <section
          className="home-section"
          aria-labelledby="home-requests-heading"
        >
          <div className="section-header">
            <h2 id="home-requests-heading">资料征集</h2>
            <Link className="text-link" to="/requests">
              查看全部征集
            </Link>
          </div>
          <div className="panel home-requests-panel">
            {open.isPending && <Message title="正在加载征集…" busy />}
            {open.isError && (
              <Message
                title="征集加载失败"
                action={
                  <button
                    className="button"
                    onClick={() => void open.refetch()}
                  >
                    重试
                  </button>
                }
              />
            )}
            {open.data &&
              (open.data.items.length ? (
                <ul className="home-request-list">
                  {open.data.items.map((item) => (
                    <li key={item.id}>
                      <div className="home-request-heading">
                        <span
                          className="archive-code"
                          title={item.archive_code || item.id}
                        >
                          {item.archive_code || item.id}
                        </span>
                        <span className="type-label request-badge-open">
                          征集中
                        </span>
                      </div>
                      <h3 className="resource-title">
                        <Link to={`/requests/${encodeURIComponent(item.id)}`}>
                          {item.title}
                        </Link>
                      </h3>
                      <div className="home-request-footer">
                        <p className="resource-meta">
                          {[
                            item.colleges.map(({ name }) => name).join("、"),
                            item.course?.name,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <Link
                          className="text-link"
                          to={`/upload?${new URLSearchParams({ request_id: item.id })}`}
                          aria-label={`响应投稿：${item.title}`}
                        >
                          响应投稿
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Message title="暂无进行中的征集" />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
