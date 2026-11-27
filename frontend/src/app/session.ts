export function loginPath(destination: string) {
  return `/login?${new URLSearchParams({ return_to: destination })}`;
}

export function returnPath(search: string) {
  const value = new URLSearchParams(search).get("return_to");
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  const normalized = new URL(value, window.location.origin);
  if (
    normalized.origin !== window.location.origin ||
    normalized.pathname === "/login"
  )
    return "/";
  return `${normalized.pathname}${normalized.search}${normalized.hash}`;
}
