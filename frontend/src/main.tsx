import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Link,
  Outlet,
  RouterProvider,
  ScrollRestoration,
} from "react-router-dom";
import { mockEnabled, setUnauthorizedHandler } from "./api/client";
import { retryQuery, sessionQuery } from "./api/queries";
import {
  AdminLayout,
  Profile,
  RequireSession,
  UserLayout,
} from "./app/layouts";
import { Message } from "./components/ui";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Resources = lazy(() => import("./pages/Resources"));
const ResourceDetail = lazy(() => import("./pages/ResourceDetail"));
const ResourcePreview = lazy(() => import("./pages/ResourcePreview"));
const Admin = lazy(() => import("./pages/Admin"));
const Requests = lazy(() => import("./pages/Requests"));
const RequestDetails = lazy(() =>
  import("./pages/Requests").then((module) => ({
    default: module.RequestDetails,
  })),
);
const Submission = lazy(() => import("./pages/Submission"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryQuery } },
});
setUnauthorizedHandler(() => {
  queryClient.setQueryData(sessionQuery.queryKey, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== "session",
  });
});

const router = createBrowserRouter([
  {
    element: (
      <>
        <Suspense fallback={<Message title="正在加载页面…" busy />}>
          <Outlet />
        </Suspense>
        <ScrollRestoration />
      </>
    ),
    errorElement: (
      <Message
        title="页面加载失败"
        action={
          <a className="button" href="/">
            返回首页
          </a>
        }
      />
    ),
    children: [
      { path: "/login", element: <Login /> },
      {
        element: <RequireSession />,
        children: [
          {
            element: <UserLayout />,
            children: [
              { index: true, element: <Home /> },
              { path: "resources", element: <Resources /> },
              { path: "resources/:id", element: <ResourceDetail /> },
              {
                path: "resources/:id/preview/:fileId",
                element: <ResourcePreview />,
              },
              { path: "profile", element: <Profile /> },
              { path: "requests", element: <Requests /> },
              { path: "requests/:id", element: <RequestDetails /> },
              { path: "upload", element: <Submission /> },
              {
                path: "*",
                element: (
                  <Message
                    title="找不到这个页面"
                    action={
                      <Link className="button" to="/">
                        返回首页
                      </Link>
                    }
                  />
                ),
              },
            ],
          },
        ],
      },
      {
        element: <RequireSession admin />,
        children: [
          {
            path: "admin",
            element: <AdminLayout />,
            children: [{ index: true, element: <Admin /> }],
          },
        ],
      },
    ],
  },
]);

const root = createRoot(document.getElementById("root")!);

async function start() {
  if (import.meta.env.DEV && mockEnabled) {
    const { startMocks } = await import("./mocks/browser");
    await startMocks();
  }
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start().catch((error: unknown) => {
  if (import.meta.env.DEV) console.error(error);
  root.render(<Message title="应用启动失败，请刷新页面。" />);
});
