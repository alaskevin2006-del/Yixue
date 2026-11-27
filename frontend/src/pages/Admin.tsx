import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Message } from "../components/ui";

export default function Admin() {
  const dashboard = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: ({ signal }) => api.dashboard(signal),
  });
  return (
    <section className="standard-page">
      <h1>管理工作台</h1>
      {dashboard.isPending && <Message title="正在加载工作台…" busy />}
      {dashboard.isError && (
        <Message
          title="工作台加载失败"
          action={
            <button className="button" onClick={() => void dashboard.refetch()}>
              重试
            </button>
          }
        />
      )}
      {dashboard.data && (
        <dl className="dashboard-grid">
          <div className="panel">
            <dt>资料总数</dt>
            <dd>{dashboard.data.resource_count}</dd>
          </div>
          <div className="panel">
            <dt>待审核</dt>
            <dd>{dashboard.data.pending_count}</dd>
          </div>
          <div className="panel">
            <dt>征集中</dt>
            <dd>{dashboard.data.open_request_count}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
