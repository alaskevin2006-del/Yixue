import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  House,
  LibraryBig,
  LogOut,
  ClipboardList,
  Upload,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { sessionQuery } from "../api/queries";
import { Brand, Message } from "../components/ui";
import { loginPath } from "./session";

const userNav = [
  { to: "/", label: "首页", icon: House },
  { to: "/resources", label: "资料索引", icon: LibraryBig },
  { to: "/requests", label: "征集", icon: ClipboardList },
  { to: "/profile", label: "我的", icon: UserRound },
];

export function RequireSession({ admin = false }: { admin?: boolean }) {
  const location = useLocation();
  const session = useQuery(sessionQuery);
  if (session.isPending) return <Message title="正在检查登录状态…" busy />;
  if (session.isError)
    return (
      <Message
        title="无法检查登录状态"
        action={
          <button className="button" onClick={() => void session.refetch()}>
            重试
          </button>
        }
      />
    );
  if (!session.data)
    return (
      <Navigate
        replace
        to={loginPath(location.pathname + location.search + location.hash)}
      />
    );
  if (admin && session.data.role !== "admin")
    return (
      <Message
        title="此页面需要管理员权限。"
        action={
          <Link className="button" to="/">
            返回首页
          </Link>
        }
      />
    );
  return <Outlet />;
}

export function UserLayout() {
  const session = useQuery(sessionQuery);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="主导航">
            {userNav.slice(0, 3).map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === "/"}>
                {to === "/requests" ? "资料征集" : label}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/upload" className="button primary nav-upload">
            <Upload size={16} aria-hidden="true" />
            我要投稿
          </NavLink>
          <div className="account-nav">
            {session.data?.role === "admin" && (
              <Link to="/admin" className="text-link">
                <ShieldCheck size={17} />
                管理台
              </Link>
            )}
            <NavLink to="/profile" className="account-link">
              <span className="avatar">
                <UserRound size={16} />
              </span>
              <span>{session.data?.display_name}</span>
            </NavLink>
          </div>
        </div>
      </header>
      <main id="main-content" className="app-container">
        <Outlet />
      </main>
      <nav className="mobile-nav" aria-label="移动主导航">
        {userNav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}>
            <Icon size={21} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function AdminLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Brand />
          <span className="admin-label">
            <ShieldCheck size={18} />
            管理端
          </span>
          <Link to="/" className="text-link admin-back">
            返回用户端
          </Link>
        </div>
      </header>
      <main className="app-container">
        <Outlet />
      </main>
    </div>
  );
}

export function Profile() {
  const queryClient = useQueryClient();
  const session = useQuery(sessionQuery);
  const logout = useMutation({
    mutationFn: api.logout,
    async onSuccess() {
      await queryClient.cancelQueries();
      queryClient.setQueryData(sessionQuery.queryKey, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
    },
  });
  return (
    <section className="standard-page">
      <h1>个人中心</h1>
      <div className="panel profile-panel">
        <span className="avatar large">
          <UserRound size={24} />
        </span>
        <div>
          <h2>{session.data?.display_name}</h2>
          <p className="muted">{session.data?.email}</p>
        </div>
        {session.data?.role === "admin" && (
          <Link to="/admin" className="button">
            进入管理台
          </Link>
        )}
        <button
          className="button logout"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut size={16} />
          {logout.isPending ? "正在退出…" : "退出登录"}
        </button>
        {logout.isError && (
          <p role="alert" className="error-text">
            退出失败，请重试。
          </p>
        )}
      </div>
    </section>
  );
}
