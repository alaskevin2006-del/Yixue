import type { Catalog, Course, ResourceDetail } from "../api/types";
import samplePdfs from "virtual:yixue-sample-pdfs";

const category = (id: string, name: string) => ({ id, name, active: true });

const colleges = [
  category("cs", "计算机学院"),
  category("se", "软件工程学院"),
  category("ai", "人工智能学院"),
  category("cyber", "网络空间安全学院"),
  category("ise", "智能工程学院"),
];
const types = [
  category("exam", "期末真题"),
  category("notes", "课程笔记"),
  category("slides", "课程课件"),
  category("exercise", "练习题"),
];

export const catalog: Catalog = {
  colleges,
  resource_types: types,
  grades: [
    { value: 1, label: "大一" },
    { value: 2, label: "大二" },
    { value: 3, label: "大三" },
    { value: 4, label: "大四" },
  ],
  semesters: [
    { value: "first", label: "上学期" },
    { value: "second", label: "下学期" },
  ],
};

export const courses: Course[] = [
  {
    ...category("data", "数据结构"),
    college_ids: ["cs", "se"],
    aliases: ["Data Structures"],
  },
  {
    ...category("os", "操作系统"),
    college_ids: ["cs", "se", "cyber"],
    aliases: ["OS"],
  },
  {
    ...category("ml", "机器学习"),
    college_ids: ["ai", "ise"],
    aliases: ["Machine Learning"],
  },
  {
    ...category("network", "计算机网络"),
    college_ids: ["cs", "cyber"],
    aliases: ["计网"],
  },
  {
    ...category("math", "离散数学"),
    college_ids: ["cs", "se", "ai"],
    aliases: [],
  },
  { ...category("control", "自动控制原理"), college_ids: ["ise"], aliases: [] },
];

const samples = [
  ["数据结构 2025 年期末真题", 0, 0, 2025, 84],
  ["操作系统复习笔记与知识点整理", 1, 1, 2026, 56],
  ["机器学习导论 · 课程课件合集", 2, 2, 2026, 39],
  ["计算机网络 2025 年期末试卷", 3, 0, 2025, 71],
  ["离散数学章节练习及参考答案", 4, 3, 2026, 25],
  ["自动控制原理期末复习提纲", 5, 1, 2026, 17],
  ["数据结构 · 树与图专项练习", 0, 3, 2026, 21],
  ["操作系统 2024 年期末回忆卷", 1, 0, 2024, 62],
  ["机器学习算法梳理与笔记", 2, 1, 2025, 43],
  ["计算机网络 · 传输层课件", 3, 2, 2026, 19],
  ["离散数学 · 图论部分课件", 4, 2, 2025, 32],
  ["自动控制原理 2024 年期末真题", 5, 0, 2024, 37],
] as const;

const exampleResources: ResourceDetail[] = samples.map(
  ([title, courseIndex, type, year, downloads], index) => {
    const id = `res_${String(index + 1).padStart(3, "0")}`;
    const course = courses[courseIndex];
    const timestamp = new Date(Date.UTC(2026, 10, 26 - index)).toISOString();
    const files = Array.from(
      { length: index % 3 === 0 ? 2 : 1 },
      (_, file) => ({
        id: `${id}_f${file + 1}`,
        filename: `${file === 0 ? title : "参考答案"}.pdf`,
        content_type: "application/pdf",
        size_bytes: 420_000 + index * 96_000 + file * 570_000,
        preview_supported: true,
      }),
    );

    return {
      id,
      title,
      course: category(course.id, course.name),
      colleges: colleges.filter((college) =>
        course.college_ids.includes(college.id),
      ),
      grades: courseIndex === 4 ? [1] : courseIndex === 2 ? [3, 4] : [2, 3],
      semester: index % 2 === 0 ? "first" : "second",
      year,
      resource_type: types[type],
      source: "演示投稿",
      version: "v1.0",
      review_status: index === 2 ? "pending" : "approved",
      safety_status: "passed",
      visibility: "published",
      file_count: files.length,
      files,
      download_count: downloads,
      created_at: timestamp,
      updated_at: timestamp,
      description: "这条资料用于本地演示资料信息和附件列表。",
      request_id: null,
    };
  },
);

export const localPdfFiles = new Map(samplePdfs.map((file) => [file.id, file]));
const sampleTimestamp = new Date().toISOString();
export const resources: ResourceDetail[] = [
  ...samplePdfs.map((file): ResourceDetail => ({
    id: `resource-${file.id}`,
    title: file.filename.replace(/\.pdf$/i, ""),
    course: category("local-sample", "本地测试资料"),
    colleges: [],
    grades: [],
    semester: null,
    year: null,
    resource_type: category("local-pdf", "测试 PDF"),
    source: "本地测试目录",
    version: null,
    description: null,
    request_id: null,
    review_status: "approved",
    safety_status: "passed",
    visibility: "published",
    file_count: 1,
    download_count: 0,
    created_at: sampleTimestamp,
    updated_at: sampleTimestamp,
    files: [
      {
        id: file.id,
        filename: file.filename,
        size_bytes: file.size,
        content_type: "application/pdf",
        preview_supported: true,
      },
    ],
  })),
  ...exampleResources,
];
