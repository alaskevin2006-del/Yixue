import { BookOpen, FileText, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import type { ResourceSummary } from "../api/types";

export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <BookOpen size={19} />
      </span>
      <span>逸学</span>
    </Link>
  );
}

export function SearchBox({
  initialValue = "",
  onSearch,
  onChange,
}: {
  initialValue?: string;
  onSearch: (keyword: string) => void;
  onChange?: (keyword: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current && input.current.value !== initialValue)
      input.current.value = initialValue;
  }, [initialValue]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(
      String(new FormData(event.currentTarget).get("keyword") ?? "").trim(),
    );
  }

  return (
    <form className="search-box" role="search" onSubmit={submit}>
      <Search size={20} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        name="keyword"
        defaultValue={initialValue}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder="搜索课程名称、资料标题"
        aria-label="搜索课程名称、资料标题"
      />
      <button className="button primary" type="submit">
        搜索
      </button>
    </form>
  );
}

export function Message({
  title,
  action,
  busy = false,
}: {
  title: string;
  action?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="message" role={busy ? "status" : undefined}>
      <p>{title}</p>
      {action}
    </div>
  );
}

export function ResourceList({ items }: { items: ResourceSummary[] }) {
  return (
    <ul className="resource-list">
      {items.map((item) => (
        <li className="resource-row" key={item.id}>
          <Link
            className="resource-link"
            to={`/resources/${encodeURIComponent(item.id)}`}
          >
            <span className="file-icon">
              <FileText size={20} aria-hidden="true" />
            </span>
            <span className="resource-text">
              <span className="resource-title">{item.title}</span>
              <span className="resource-meta">
                {[item.course.name, item.year, `${item.file_count} 个附件`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="type-label">{item.resource_type.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
