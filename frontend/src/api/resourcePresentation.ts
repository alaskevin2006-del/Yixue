import type { ResourceSummary } from "./types";

const sizeFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
});
const largeSizeFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fileSizeUnits = ["KB", "MB", "GB", "TB"] as const;

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${sizeFormatter.format(bytes)} B`;
  let size = bytes / 1024;
  let unit = 0;
  // Move to the next unit before the current one needs four digits.
  while (size >= 1000 && unit < fileSizeUnits.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const formatter = unit === 0 ? sizeFormatter : largeSizeFormatter;
  return `${formatter.format(size)} ${fileSizeUnits[unit]}`;
}

export function resourcePath(id: string) {
  return `/resources/${encodeURIComponent(id)}`;
}

export function resourceShareUrl(id: string) {
  return new URL(
    resourcePath(id),
    import.meta.env.VITE_SITE_URL || window.location.origin,
  ).href;
}

export function archiveCode(resource: ResourceSummary) {
  return resource.archive_code || resource.id;
}

export const semesterLabels = { first: "上学期", second: "下学期" } as const;
export const reviewLabels = {
  pending: "待审核",
  approved: "已审核",
  rejected: "未通过审核",
} as const;
