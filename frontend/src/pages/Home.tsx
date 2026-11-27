import { useQuery } from "@tanstack/react-query";
import { Building2, CodeXml, Cpu, Network, Shield } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { catalogQuery, requestsQuery, resourcesQuery } from "../api/queries";
import { Message, ResourceList, SearchBox } from "../components/ui";

const collegeIcons = [Cpu, CodeXml, Network, Shield, Building2];

export default function Home() {
  const navigate = useNavigate();
  const catalog = useQuery(catalogQuery);
  const recent = useQuery(resourcesQuery("sort=latest&page_size=6"));
  const open = useQuery(requestsQuery("status=open&page_size=5"));
  return (
    <div className="home-page">
      <section className="home-search">
        <div className="home-search-content">
          <h1>查找学习资料</h1>
          <p>检索中山大学信息类学院的真题、课件和课程笔记。</p>
          <SearchBox
            onSearch={(keyword) =>
              navigate(
                keyword
                  ? `/resources?${new URLSearchParams({ keyword })}`
                  : "/resources",
              )
            }
          />
        </div>
      </section>
      <section className="home-section" aria-labelledby="colleges-heading">
        <div className="section-header">
          <h2 id="colleges-heading">按学院浏览</h2>
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
        {catalog.data && (
          <ul className="college-grid">
            {catalog.data.colleges.map((college, index) => {
              const Icon = collegeIcons[index] ?? Building2;
              return (
                <li key={college.id}>
                  <Link
                    to={`/resources?${new URLSearchParams({ college_ids: college.id })}`}
                    className="college-link"
                  >
                    <span className="college-icon">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <span>{college.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="home-feeds">
        <section
          className="home-section recent-section"
          aria-labelledby="recent-heading"
        >
          <div className="section-header">
            <h2 id="recent-heading">近期更新</h2>
            <Link to="/resources" className="text-link">
              查看全部资料
            </Link>
          </div>
          <div className="panel">
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
          <div className="panel">
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
              (open.data.items.length > 0 ? (
                <ul className="requests-list compact-requests">
                  {open.data.items.map((item) => (
                    <li key={item.id}>
                      <Link to={`/requests/${encodeURIComponent(item.id)}`}>
                        <div>
                          <h3>{item.title}</h3>
                          <p className="muted">
                            {item.submission_count} 份响应
                          </p>
                        </div>
                      </Link>
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
