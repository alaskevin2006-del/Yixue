import { HttpResponse } from "msw";

export const base = "/api/v1";
export const ok = <T>(data: T, status = 200) =>
  HttpResponse.json({ code: "OK", message: "success", data }, { status });
export const problem = (status: number, code: string, message: string) =>
  HttpResponse.json({ code, message, data: null }, { status });
export const denied = () => problem(401, "UNAUTHENTICATED", "请先登录。");
export const missing = () =>
  problem(404, "NOT_FOUND", "资料不存在或当前无法访问。");

export function paginate<T>(items: T[], params: URLSearchParams) {
  const page = Math.max(1, Math.trunc(Number(params.get("page"))) || 1);
  const page_size = Math.min(
    100,
    Math.max(1, Math.trunc(Number(params.get("page_size"))) || 20),
  );
  return {
    items: items.slice((page - 1) * page_size, page * page_size),
    total: items.length,
    page,
    page_size,
  };
}
