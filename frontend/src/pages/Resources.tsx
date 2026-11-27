import { useQuery } from "@tanstack/react-query";
import { ListFilter, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { catalogQuery, resourcesQuery } from "../api/queries";
import type { Catalog, Course } from "../api/types";
import { Message, ResourceList, SearchBox } from "../components/ui";

const filterNames = {
  college_ids: "适用学院",
  course_ids: "课程",
  grades: "适用年级",
  semesters: "学期",
  type_ids: "资料类型",
  years: "归档年份",
};
type Filter = keyof typeof filterNames;
const filterKeys = Object.keys(filterNames) as Filter[];
const catalogPageSize = 5;
type Option = { value: string; label: string };
const asOptions = (items: { id: string; name: string }[]) =>
  items.map(({ id, name }) => ({ value: id, label: name }));

function FilterGroup({
  group,
  options,
  params,
  onToggle,
}: {
  group: Filter;
  options: Option[];
  params: URLSearchParams;
  onToggle: (key: Filter, value: string) => void;
}) {
  const selected = params.getAll(group);
  return (
    <fieldset className={`filter-group filter-${group}`}>
      <legend>{filterNames[group]}</legend>
      <div className="filter-options">
        {options.map(({ value, label }) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(group, value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FilterForm({
  catalog,
  courses,
  params,
  onChange,
  onCourseSearch,
}: {
  catalog: Catalog;
  courses: Course[];
  params: URLSearchParams;
  onChange: (params: URLSearchParams, changedCollege?: boolean) => void;
  onCourseSearch: (value: string) => void;
}) {
  const years = [
    ...new Set([
      ...(catalog.years ?? []).map(String),
      ...params.getAll("years"),
    ]),
  ].sort((a, b) => Number(b) - Number(a));
  function toggle(key: Filter, value: string) {
    const next = new URLSearchParams(params);
    if (next.getAll(key).includes(value)) next.delete(key, value);
    else next.append(key, value);
    onChange(next, key === "college_ids");
  }

  const yearForm = (
    <form
      className="filter-group year-filter"
      onSubmit={(event) => {
        event.preventDefault();
        const value = String(
          new FormData(event.currentTarget).get("year") ?? "",
        );
        if (!/^\d{4}$/.test(value) || params.getAll("years").includes(value))
          return;
        toggle("years", value);
        event.currentTarget.reset();
      }}
    >
      <label htmlFor="year">{years.length ? "其他归档年份" : "归档年份"}</label>
      <div>
        <input
          id="year"
          className="field"
          name="year"
          type="text"
          inputMode="numeric"
          placeholder="例如 2025"
          pattern="[0-9]{4}"
          maxLength={4}
          required
        />
        <button className="button compact" type="submit">
          添加
        </button>
      </div>
    </form>
  );

  return (
    <>
      <FilterGroup
        group="college_ids"
        options={asOptions(catalog.colleges)}
        params={params}
        onToggle={toggle}
      />
      <FilterGroup
        group="type_ids"
        options={asOptions(catalog.resource_types)}
        params={params}
        onToggle={toggle}
      />
      <FilterGroup
        group="grades"
        options={catalog.grades.map(({ value, label }) => ({
          value: String(value),
          label,
        }))}
        params={params}
        onToggle={toggle}
      />
      {years.length > 0 && (
        <FilterGroup
          group="years"
          options={years.map((year) => ({ value: year, label: year }))}
          params={params}
          onToggle={toggle}
        />
      )}
      {years.length === 0 && yearForm}
      <details
        className="filter-more"
        open={
          Boolean(
            params.getAll("course_ids").length ||
            params.getAll("semesters").length,
          ) || undefined
        }
      >
        <summary>更多筛选</summary>
        <div className="course-filter">
          <input
            className="field"
            type="search"
            placeholder="检索课程"
            aria-label="搜索筛选课程"
            onChange={(event) => onCourseSearch(event.target.value.trim())}
          />
          <FilterGroup
            group="course_ids"
            options={asOptions(courses)}
            params={params}
            onToggle={toggle}
          />
          {!courses.length && <p className="muted">没有匹配的课程</p>}
        </div>
        <FilterGroup
          group="semesters"
          options={catalog.semesters}
          params={params}
          onToggle={toggle}
        />
        {years.length > 0 && yearForm}
      </details>
    </>
  );
}

export default function Resources() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<URLSearchParams | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [draftNotice, setDraftNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const searchTimer = useRef<number | undefined>(undefined);
  const latestParams = useRef(params);
  const catalog = useQuery(catalogQuery);
  const pageParams = new URLSearchParams(params);
  pageParams.set("page_size", String(catalogPageSize));
  const results = useQuery(resourcesQuery(pageParams.toString()));
  const courseParams = new URLSearchParams({ page_size: "100" });
  const activeFilters = draft ?? params;
  for (const id of activeFilters.getAll("college_ids"))
    courseParams.append("college_ids", id);
  if (courseSearch) courseParams.set("keyword", courseSearch);
  const courseQuery = courseParams.toString();
  const courses = useQuery({
    queryKey: ["courses", courseQuery],
    queryFn: ({ signal }) => api.courses(courseQuery, signal),
    staleTime: 60_000,
  });
  const selectedCourseIds = activeFilters.getAll("course_ids");
  const selectedCourses = useQuery({
    queryKey: ["selected-courses", selectedCourseIds],
    queryFn: ({ signal }) =>
      Promise.all(selectedCourseIds.map((id) => api.course(id, signal))),
    enabled: selectedCourseIds.length > 0,
    staleTime: 60_000,
  });
  const keyword = params.get("keyword") ?? "";

  useEffect(() => {
    latestParams.current = params;
  }, [params]);
  useEffect(() => () => window.clearTimeout(searchTimer.current), [keyword]);

  function commit(next: URLSearchParams, resetPage = true, replace = false) {
    if (resetPage) next.delete("page");
    if (next.toString() === latestParams.current.toString()) return;
    latestParams.current = next;
    setParams(next, { replace, preventScrollReset: resetPage });
  }

  function search(value: string, replace = false) {
    window.clearTimeout(searchTimer.current);
    const next = new URLSearchParams(latestParams.current);
    if (value) next.set("keyword", value);
    else next.delete("keyword");
    commit(next, true, replace);
  }

  function updateFilters(next: URLSearchParams, changedCollege?: boolean) {
    let changeNotice = "";
    const colleges = next.getAll("college_ids");
    if (changedCollege && colleges.length) {
      const known = new Map(
        [...(courses.data?.items ?? []), ...(selectedCourses.data ?? [])].map(
          (course) => [course.id, course],
        ),
      );
      const removed = next.getAll("course_ids").flatMap((id) => {
        const course = known.get(id);
        return course &&
          !course.college_ids.some((college) => colleges.includes(college))
          ? [course]
          : [];
      });
      for (const course of removed) next.delete("course_ids", course.id);
      if (removed.length)
        changeNotice = `已清除与所选学院不匹配的课程：${removed.map((item) => item.name).join("、")}`;
    }
    if (draft) {
      setDraft(next);
      if (changeNotice) setDraftNotice(changeNotice);
    } else {
      setNotice(changeNotice);
      commit(next);
    }
  }

  function clearFilters() {
    const next = new URLSearchParams(latestParams.current);
    for (const key of filterKeys) next.delete(key);
    setNotice("");
    commit(next);
  }

  const chosen = filterKeys.flatMap((key) =>
    params.getAll(key).map((value) => ({ key, value })),
  );
  const labels: Partial<Record<Filter, Option[]>> = catalog.data
    ? {
        college_ids: asOptions(catalog.data.colleges),
        type_ids: asOptions(catalog.data.resource_types),
        course_ids: asOptions(
          selectedCourses.data ?? courses.data?.items ?? [],
        ),
        grades: catalog.data.grades.map(({ value, label }) => ({
          value: String(value),
          label,
        })),
        semesters: catalog.data.semesters,
      }
    : {};

  const filterContent = catalog.data ? (
    <>
      <FilterForm
        catalog={catalog.data}
        courses={courses.data?.items ?? []}
        params={activeFilters}
        onChange={updateFilters}
        onCourseSearch={setCourseSearch}
      />
      {courses.isError && (
        <p role="alert" className="error-text">
          课程选项加载失败。
        </p>
      )}
    </>
  ) : (
    <Message
      title={catalog.isError ? "筛选加载失败" : "正在加载筛选…"}
      busy={catalog.isPending}
      action={
        catalog.isError ? (
          <button className="button" onClick={() => void catalog.refetch()}>
            重试
          </button>
        ) : undefined
      }
    />
  );

  const total = results.data?.total;
  const page = results.data?.page ?? 1;
  const pages = results.data
    ? Math.ceil(results.data.total / results.data.page_size)
    : 0;
  function goToPage(value: number) {
    const next = new URLSearchParams(latestParams.current);
    if (value === 1) next.delete("page");
    else next.set("page", String(value));
    commit(next, false);
  }

  return (
    <section className="standard-page library-page">
      <div className="editorial-header library-top">
        <div>
          <h1>学习资料档案库</h1>
          <p>收录中山大学五个信息类学院的历年真题、课程讲义与复习笔记。</p>
        </div>
        <SearchBox
          initialValue={keyword}
          onSearch={search}
          onChange={(value) => {
            window.clearTimeout(searchTimer.current);
            searchTimer.current = window.setTimeout(
              () => search(value.trim(), true),
              300,
            );
          }}
        />
      </div>
      <div className="library-grid">
        <aside className="filter-sidebar" aria-label="编目筛选">
          {!draft && filterContent}
        </aside>
        <section className="results" aria-labelledby="archive-results">
          <div className="results-toolbar">
            {chosen.length > 0 && (
              <div className="chosen-filters" aria-label="已选筛选条件">
                <span className="filter-caption">已选编目</span>
                {chosen.map(({ key, value }) => {
                  const label =
                    labels[key]?.find((option) => option.value === value)
                      ?.label ?? value;
                  return (
                    <button
                      className="chip"
                      type="button"
                      key={`${key}:${value}`}
                      aria-label={`移除${filterNames[key]} ${label}`}
                      onClick={() => {
                        const next = new URLSearchParams(latestParams.current);
                        next.delete(key, value);
                        updateFilters(next, key === "college_ids");
                      }}
                    >
                      {label}
                      <X size={14} aria-hidden="true" />
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="text-link"
                  onClick={clearFilters}
                >
                  清除筛选
                </button>
              </div>
            )}
            <div className="results-controls">
              <h2 className="archive-results-count" id="archive-results">
                {total === undefined ? "检索结果" : `${total} 份资料`}
              </h2>
              <button
                type="button"
                className="button compact mobile-filter"
                onClick={() => {
                  setDraft(new URLSearchParams(params));
                  setCourseSearch("");
                  dialog.current?.showModal();
                }}
              >
                <ListFilter size={17} />
                筛选{chosen.length > 0 && ` (${chosen.length})`}
              </button>
              <select
                className="field sort-field"
                aria-label="资料排序"
                value={params.get("sort") ?? "latest"}
                onChange={(event) => {
                  const next = new URLSearchParams(latestParams.current);
                  if (event.target.value === "latest") next.delete("sort");
                  else next.set("sort", event.target.value);
                  commit(next);
                }}
              >
                <option value="latest">最新归档</option>
                <option value="year_desc">年份降序</option>
                <option value="popular">下载热度</option>
              </select>
            </div>
          </div>
          <p className="filter-notice" role="status">
            {notice}
          </p>
          <div className="panel archive-panel">
            {results.isPending && <Message title="正在加载资料…" busy />}
            {results.isError && (
              <Message
                title="资料加载失败"
                action={
                  <button
                    className="button"
                    onClick={() => void results.refetch()}
                  >
                    重试
                  </button>
                }
              />
            )}
            {results.data &&
              (results.data.items.length ? (
                <ResourceList items={results.data.items} catalog />
              ) : (
                <Message
                  title="没有找到符合条件的资料"
                  action={
                    page > 1 ? (
                      <button className="button" onClick={() => goToPage(1)}>
                        返回第一页
                      </button>
                    ) : (
                      <button
                        className="button"
                        onClick={() => commit(new URLSearchParams())}
                      >
                        清除搜索和筛选
                      </button>
                    )
                  }
                />
              ))}
          </div>
          {pages > 1 && (
            <nav
              className="pagination archive-pagination"
              aria-label="资料分页"
            >
              <span>
                第 {page} / {pages} 页
              </span>
              <div>
                <button
                  className="button"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  上一页
                </button>
                <button
                  className="button"
                  disabled={page >= pages}
                  onClick={() => goToPage(page + 1)}
                >
                  下一页
                </button>
              </div>
            </nav>
          )}
        </section>
      </div>
      <dialog
        className="filter-dialog"
        ref={dialog}
        aria-labelledby="filter-dialog-title"
        onClose={() => {
          setDraft(null);
          setCourseSearch("");
          setDraftNotice("");
        }}
      >
        <div className="dialog-header">
          <h2 id="filter-dialog-title">筛选资料</h2>
          <button
            type="button"
            className="button icon-button"
            aria-label="关闭筛选"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <div className="dialog-body">
          <p className="filter-notice" role="status">
            {draftNotice}
          </p>
          {draft && filterContent}
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="button primary"
            onClick={() => {
              if (draft) {
                const next = new URLSearchParams(latestParams.current);
                for (const key of filterKeys) {
                  next.delete(key);
                  for (const value of draft.getAll(key))
                    next.append(key, value);
                }
                setNotice(draftNotice);
                commit(next);
              }
              dialog.current?.close();
            }}
          >
            查看结果
          </button>
        </div>
      </dialog>
    </section>
  );
}
