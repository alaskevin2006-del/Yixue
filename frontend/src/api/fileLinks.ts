import { mockEnabled } from "./client";

export function fileAccessUrl(value: string) {
  const url = new URL(value, window.location.origin);
  if (
    mockEnabled &&
    url.protocol === "blob:" &&
    url.origin === window.location.origin
  )
    return url.href;
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("文件地址格式无效。");
  }
  return url.href;
}
