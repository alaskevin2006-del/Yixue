const timelineShell = document.querySelector('[data-timeline-shell]');
const dateStrip = document.querySelector('[data-date-strip]');
const today = new Date(2026, 8, 28);
const calendarState = {
  selectedDate: new Date(today),
  mode: "day",
  candidateVisible: false,
  candidateAccepted: false,
  lastUserInput: "",
  candidateTitle: "C++ iterator 复习",
  candidateTime: "21:00 - 22:00",
};
const fallbackPlannerSubjects = [
  { id: "demo-cpp", name: "C++" },
  { id: "demo-math", name: "高等数学" },
  { id: "demo-ds", name: "数据结构" },
  { id: "demo-os", name: "操作系统" },
  { id: "demo-probability", name: "概率论" },
  { id: "demo-english", name: "大学英语" },
  { id: "demo-software", name: "软件工程" },
];
const fallbackPlannerStates = {
  "demo-cpp": "最近在学习 STL 容器、模板和多态。vector::erase 的失效范围已经理解，循环删除时 iterator 的更新方式还需要结合代码确认。",
  "demo-math": "高等数学最近还没有整理明确现状。可以先补充当前章节、作业或备考压力，再让 AI 辅助安排下一步。",
  "demo-ds": "数据结构正在复习树和图。二叉树遍历比较熟，最短路径和拓扑排序还需要用题目巩固。",
  "demo-os": "操作系统刚开始看进程与线程。概念能跟上，但同步互斥还没有形成稳定理解。",
  "demo-probability": "概率论最近在做条件概率和随机变量。公式能套用，但题目条件转换容易漏。",
  "demo-english": "大学英语主要准备本周阅读与听力。长句理解还可以，听力细节记录不够稳定。",
  "demo-software": "软件工程小组作业需要整理需求边界。个人部分已经有草稿，还缺一次与组员对齐。",
};
const plannerState = {
  selectedSubjectId: "demo-cpp",
  subjectQuery: "",
  stateOverrides: {},
  editing: false,
  draft: "",
  messages: [],
  input: "",
  plan: null,
  status: "",
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayDiff(date, base) {
  return Math.round((startOfDay(date) - startOfDay(base)) / 86400000);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function getDayLabel(date) {
  const diff = dayDiff(date, today);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === -1) return "昨天";
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

function renderDateStrip() {
  if (!dateStrip) return;
  const buttons = Array.from(dateStrip.querySelectorAll("[data-date-offset]"));
  buttons.forEach((button, index) => {
    const offset = index - 3;
    const date = addDays(calendarState.selectedDate, offset);
    button.dataset.dateOffset = String(offset);
    button.classList.toggle("active", offset === 0);
    button.querySelector("strong").textContent = String(date.getDate());
    button.querySelector("span").textContent = getDayLabel(date);
  });
}

function renderTimeline() {
  if (!timelineShell) return;
  const diff = dayDiff(calendarState.selectedDate, today);
  const rows = ['<h1 class="sr-only" id="home-title">首页</h1>'];

  if (calendarState.mode === "week") {
    renderWeekTimeline(rows);
    timelineShell.innerHTML = rows.join("");
    timelineShell.setAttribute("aria-label", `${calendarState.selectedDate.getMonth() + 1}月${calendarState.selectedDate.getDate()}日所在周`);
    return;
  }

  rows.push('<div class="day-calendar" aria-label="日视图">');
  for (let hour = 0; hour <= 23; hour += 1) {
    const time = `${String(hour).padStart(2, "0")}:00`;
    const isNow = diff === 0 && hour === 20;
    const isFixed = diff === 0 && hour === 19;
    const showCandidate = diff === 0 && hour === 21 && calendarState.candidateVisible;
    const rowClass = ["time-row"];
    if (isNow) rowClass.push("now-row");
    if (isFixed) rowClass.push("event-row");
    if (showCandidate) rowClass.push("candidate-row");

    let content = "<div></div>";
    if (isFixed) {
      content = '<article class="calendar-block fixed"><strong>班会</strong><span>19:00 - 20:00</span></article>';
    }
    if (isNow) {
      content = '<div class="now-line"><strong>现在</strong></div>';
    }
    if (showCandidate) {
      const acceptedClass = calendarState.candidateAccepted ? "accepted" : "candidate";
      const label = calendarState.candidateAccepted ? "" : "<small>候选安排</small>";
      content = `<article class="calendar-block ${acceptedClass}" data-home-candidate>${label}<strong>${calendarState.candidateTitle}</strong><span>${calendarState.candidateTime}</span></article>`;
    }

    rows.push(`<div class="${rowClass.join(" ")}"><span>${time}</span>${content}</div>`);
  }
  rows.push("</div>");

  timelineShell.innerHTML = rows.join("");
  timelineShell.setAttribute("aria-label", `${calendarState.selectedDate.getMonth() + 1}月${calendarState.selectedDate.getDate()}日日程`);
}

function renderWeekTimeline(rows) {
  const weekStart = addDays(calendarState.selectedDate, -calendarState.selectedDate.getDay() + 1);
  rows.push('<div class="week-calendar" aria-label="周视图">');
  rows.push('<div class="week-header"><span></span>');
  for (let day = 0; day < 7; day += 1) {
    const date = addDays(weekStart, day);
    const isSelected = dayDiff(date, calendarState.selectedDate) === 0;
    rows.push(`<button class="${isSelected ? "active" : ""}" data-week-date="${day}"><strong>${date.getDate()}</strong><span>${getDayLabel(date)}</span></button>`);
  }
  rows.push("</div>");
  for (let hour = 0; hour <= 23; hour += 1) {
    const time = `${String(hour).padStart(2, "0")}:00`;
    rows.push(`<div class="week-hour-row"><span>${time}</span>`);
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(weekStart, day);
      const diff = dayDiff(date, today);
      const isFixed = diff === 0 && hour === 19;
      const showCandidate = diff === 0 && hour === 21 && calendarState.candidateVisible;
      const isNow = diff === 0 && hour === 20;
      let content = "";
      if (isFixed) content = '<article class="calendar-block fixed compact"><strong>班会</strong><span>19:00</span></article>';
      if (showCandidate) {
        const acceptedClass = calendarState.candidateAccepted ? "accepted" : "candidate";
        content = `<article class="calendar-block ${acceptedClass} compact" data-home-candidate><strong>${calendarState.candidateTitle}</strong><span>21:00</span></article>`;
      }
      if (isNow) content += '<div class="now-dot" aria-label="现在"></div>';
      rows.push(`<div class="week-cell">${content}</div>`);
    }
    rows.push("</div>");
  }
  rows.push("</div>");
}

function renderCalendar() {
  renderDateStrip();
  renderTimeline();
  document.querySelectorAll("[data-calendar-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.calendarMode === calendarState.mode);
  });
}

document.querySelectorAll("[data-date-shift]").forEach((button) => {
  button.addEventListener("click", () => {
    calendarState.selectedDate = addDays(calendarState.selectedDate, Number(button.dataset.dateShift));
    renderCalendar();
  });
});

dateStrip?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-date-offset]");
  if (!button) return;
  calendarState.selectedDate = addDays(calendarState.selectedDate, Number(button.dataset.dateOffset));
  renderCalendar();
});

document.querySelectorAll("[data-calendar-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    calendarState.mode = button.dataset.calendarMode;
    renderCalendar();
  });
});

timelineShell?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-week-date]");
  if (!button) return;
  const weekStart = addDays(calendarState.selectedDate, -calendarState.selectedDate.getDay() + 1);
  calendarState.selectedDate = addDays(weekStart, Number(button.dataset.weekDate));
  renderCalendar();
});

function renderHomeThread() {
  const thread = document.querySelector("[data-home-thread]");
  if (!thread) return;
  thread.replaceChildren();
  thread.hidden = !calendarState.lastUserInput;
  if (!calendarState.lastUserInput) return;
  const userLine = document.createElement("div");
  userLine.className = "assist-line user";
  userLine.textContent = calendarState.lastUserInput;
  const aiLine = document.createElement("div");
  aiLine.className = "assist-line ai";
  aiLine.textContent = calendarState.candidateAccepted
    ? "已采用到本页日历示例中。这个演示不会写入真实日程，也不会自动修改学科现状。"
    : `今晚 ${calendarState.candidateTime} 可以先做「${calendarState.candidateTitle}」；我已把它作为候选放到日历里。`;
  const actions = document.createElement("div");
  actions.className = "assist-actions";
  if (calendarState.candidateAccepted) {
    actions.append(homeActionButton("撤回本页采用", "reset"));
  } else {
    actions.append(homeActionButton("继续调整", "adjust"), homeActionButton("采用", "accept"));
  }
  thread.append(userLine, aiLine, actions);
}

function plannerSubjects() {
  const seen = new Set();
  const subjects = [...(ui.subjects ?? []), ...fallbackPlannerSubjects].filter(subject => {
    if (!subject?.id || seen.has(subject.id)) return false;
    seen.add(subject.id);
    return true;
  });
  return subjects.length ? subjects : fallbackPlannerSubjects;
}

function plannerStates() {
  return { ...fallbackPlannerStates, ...(dataSource.states ?? {}), ...plannerState.stateOverrides };
}

function plannerSubjectName(id) {
  return plannerSubjects().find(subject => subject.id === id)?.name ?? "当前学科";
}

function currentPlannerText() {
  return plannerStates()[plannerState.selectedSubjectId] ?? "尚未整理当前学科的学习现状。";
}

function compactPlannerText(text, length = 44) {
  const value = (text || "尚未整理当前学科的学习现状。").replace(/\s+/g, " ").trim();
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function plannerVisibleSubjects() {
  const query = plannerState.subjectQuery.trim().toLocaleLowerCase();
  if (!query) return plannerSubjects();
  return plannerSubjects().filter(subject => {
    const state = plannerStates()[subject.id] ?? "";
    return `${subject.name} ${state}`.toLocaleLowerCase().includes(query);
  });
}

function plannerNeedsAttention(subject) {
  const state = plannerStates()[subject.id] ?? "";
  if (state.includes("尚未整理") || state.includes("还没有整理")) return "待补充现状";
  if (state.includes("还需要") || state.includes("还没有") || state.includes("容易") || state.includes("缺")) return "需要推进";
  return "可继续";
}

function renderPlannerOverview() {
  const subjects = plannerSubjects();
  const active = subjects.filter(subject => plannerNeedsAttention(subject) === "需要推进");
  const missing = subjects.filter(subject => plannerNeedsAttention(subject) === "待补充现状");
  const lead = active.slice(0, 2).map(subject => subject.name).join("、") || subjects.slice(0, 2).map(subject => subject.name).join("、");
  const overview = node("section", "state-overview");
  overview.append(node("strong", "", "多学科总体预览"));
  overview.append(node("p", "", `当前共有 ${subjects.length} 个学科现状。${lead ? `可先看 ${lead}` : "可以先补充一个学科现状"}；${missing.length ? `${missing.length} 个学科还缺少明确现状。` : "其余学科保持轻量扫读即可。"}`));
  const chips = node("div", "state-overview-chips");
  chips.append(node("span", "", `${subjects.length} 个学科`));
  chips.append(node("span", "", `${active.length} 个需要推进`));
  chips.append(node("span", "", `${missing.length} 个待补充`));
  overview.append(chips);
  overview.append(plannerButton("基于全部现状规划", "plan-all", "r1-button"));
  return overview;
}

function renderPlannerDialog() {
  const dialog = document.querySelector("[data-future-dialog]");
  if (!dialog) return;
  if (!plannerSubjects().some(subject => subject.id === plannerState.selectedSubjectId)) plannerState.selectedSubjectId = plannerSubjects()[0].id;
  const subjectList = document.querySelector("[data-planner-subjects]");
  const stateView = document.querySelector("[data-planner-state-view]");
  const messages = document.querySelector("[data-planner-messages]");
  const plan = document.querySelector("[data-planner-plan]");
  const input = document.querySelector("[data-planner-input]");
  subjectList.replaceChildren();
  subjectList.append(renderPlannerOverview());
  const search = node("input", "state-subject-search");
  search.type = "search";
  search.placeholder = "搜索学科或现状";
  search.value = plannerState.subjectQuery;
  search.dataset.plannerSubjectSearch = "";
  subjectList.append(search);
  const options = node("div", "state-subject-options");
  const visibleSubjects = plannerVisibleSubjects();
  if (!visibleSubjects.length) options.append(node("p", "local-note", "没有匹配的学科。"));
  for (const subject of visibleSubjects) {
    const item = node("button", "state-subject-option");
    item.type = "button";
    item.dataset.plannerSubject = subject.id;
    item.setAttribute("aria-current", String(subject.id === plannerState.selectedSubjectId));
    item.append(
      node("strong", "", subject.name),
      node("span", "", compactPlannerText(plannerStates()[subject.id])),
      node("small", "", plannerNeedsAttention(subject)),
    );
    options.append(item);
  }
  subjectList.append(options);
  stateView.replaceChildren();
  const title = node("div", "state-section-title");
  title.append(node("strong", "", `${plannerSubjectName(plannerState.selectedSubjectId)} 现状`));
  if (!plannerState.editing) title.append(plannerButton("编辑", "state-edit"));
  stateView.append(title);
  if (plannerState.editing) {
    const textarea = node("textarea", "state-edit-area");
    textarea.dataset.plannerStateInput = "";
    textarea.rows = 8;
    textarea.value = plannerState.draft;
    stateView.append(textarea);
    const actions = node("div", "state-inline-actions");
    actions.append(plannerButton("采用现状", "state-adopt", "r1-button"), plannerButton("取消", "state-cancel"));
    stateView.append(actions);
  } else {
    stateView.append(node("p", "state-current-text", currentPlannerText()));
  }
  messages.replaceChildren();
  if (!plannerState.messages.length) {
    messages.append(node("p", "local-note", "说出当前现实约束，AI 会把学科现状和你的输入整理成可采用的安排。"));
  }
  for (const message of plannerState.messages) {
    messages.append(node("article", message.role === "user" ? "planner-message user" : "planner-message ai", message.content));
  }
  plan.replaceChildren();
  if (plannerState.plan) {
    const card = node("article", "planner-plan-card");
    card.append(node("strong", "", plannerState.plan.title));
    card.append(node("p", "", plannerState.plan.reason));
    const slot = node("div", "planner-slot");
    slot.append(node("span", "", plannerState.plan.time), node("span", "", plannerState.plan.task));
    card.append(slot);
    const actions = node("div", "state-inline-actions");
    actions.append(plannerButton("排到日历", "schedule", "r1-button"), plannerButton("继续调整", "adjust"));
    card.append(actions);
    plan.append(card);
  }
  if (plannerState.status) plan.append(node("p", "local-note", plannerState.status));
  if (input) input.value = plannerState.input;
}

function plannerButton(label, action, className = "text-link") {
  const button = node("button", className, label);
  button.type = "button";
  button.dataset.plannerAction = action;
  return button;
}

function openPlannerDialog() {
  if (ui.subject?.id) plannerState.selectedSubjectId = ui.subject.id;
  plannerState.editing = false;
  plannerState.draft = currentPlannerText();
  renderPlannerDialog();
  document.querySelector("[data-future-dialog]")?.showModal();
}

function generatePlannerPlan(input) {
  const subject = plannerSubjectName(plannerState.selectedSubjectId);
  const taskMap = {
    "高等数学": "高数薄弱点整理",
    "数据结构": "图算法题目巩固",
    "操作系统": "同步互斥概念梳理",
    "概率论": "条件概率题目整理",
    "大学英语": "听力细节记录练习",
    "软件工程": "需求边界对齐草稿",
  };
  const task = taskMap[subject] ?? "C++ iterator 复习";
  return {
    title: "建议安排",
    time: "21:00 - 22:00",
    task,
    reason: `参考「${subject}」现状和你刚才提供的约束，先安排一个 60 分钟的明确学习块；这不会改变学科现状，采用后只进入本页日历示例。`,
  };
}

function generatePlannerOverallPlan() {
  const subjects = plannerSubjects();
  const active = subjects.filter(subject => plannerNeedsAttention(subject) === "需要推进");
  const missing = subjects.filter(subject => plannerNeedsAttention(subject) === "待补充现状");
  const primary = active[0] ?? subjects[0];
  const secondary = active[1] ?? missing[0];
  const primaryTask = primary?.name === "高等数学" ? "高数现状补充" : primary?.name === "数据结构" ? "图算法最小练习" : primary?.name === "操作系统" ? "同步互斥概念梳理" : "C++ iterator 复习";
  return {
    title: "跨学科安排建议",
    time: "21:00 - 22:00",
    task: primaryTask,
    reason: `综合 ${subjects.length} 个学科现状，先处理「${primary?.name ?? "当前学科"}」里最明确、最容易推进的一步${secondary ? `；「${secondary.name}」暂时只保留为下一轮关注` : ""}。采用后只进入本页日历示例，不会自动改写任何学科现状。`,
  };
}

function schedulePlannerPlan(plan = plannerState.plan, source = plannerState.input) {
  if (!plan) return;
  calendarState.selectedDate = new Date(today);
  calendarState.candidateVisible = true;
  calendarState.candidateAccepted = true;
  calendarState.candidateTitle = plan.task;
  calendarState.candidateTime = plan.time;
  calendarState.lastUserInput = source || `根据现状安排 ${plan.task}`;
  renderCalendar();
  renderHomeThread();
  plannerState.status = "已排到本页日历示例；这不会写入真实日程，也不会自动更新学科现状。";
  renderPlannerDialog();
}

function homeActionButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.homeAction = action;
  button.textContent = label;
  return button;
}

document.querySelector("[data-home-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("[data-home-input]");
  const value = input.value.trim();
  if (!value) return;
  calendarState.lastUserInput = value;
  calendarState.selectedDate = new Date(today);
  calendarState.candidateVisible = true;
  calendarState.candidateAccepted = false;
  input.value = "";
  renderCalendar();
  renderHomeThread();
  timelineShell?.querySelector("[data-home-candidate]")?.scrollIntoView({ block: "center", behavior: "smooth" });
});


renderCalendar();
// Position the first day view once; subsequent scrolling and renders stay user-controlled.
const initialNowRow = timelineShell?.querySelector(".now-row");
if (initialNowRow) {
  const row = initialNowRow.getBoundingClientRect();
  const surface = timelineShell.getBoundingClientRect();
  timelineShell.scrollTo({ top: row.top - surface.top + row.height / 2 - timelineShell.clientHeight / 2, behavior: "instant" });
}

// Only the dedicated demo server sets this marker. API errors never select fixtures.
const productDemo = document.documentElement.dataset.productDemo === 'true'
  ? (await import('./demo/workspace.js')).createProductDemo() : null;
// API responses are view caches. SQLite owns real-local domain data.
const dataSource = productDemo?.dataSource ?? { request: realLocalRequest };
const ui = {
  subjects: [], conversations: [], messages: [], subject: null, conversation: null,
  loadingSubjects: false, loadingConversations: false, loadingMessages: false,
  creating: false, deleting: false, tab: 'learn', desktopCollapsed: false, mobileOpen: false,
  subjectQuery: '',
};
// Presentation only, in both modes. Icons never write to the API or demo domain data.
const subjectIcons = new Map();
const iconPresets = [
  { key: 'code', label: '代码', symbol: 'C' },
  { key: 'math', label: '数学', symbol: '∑' },
  { key: 'book', label: '书本', symbol: '书' },
  { key: 'folder', label: '课程', symbol: '课' },
  { key: 'science', label: '科学', symbol: '理' },
  { key: 'tree', label: '结构', symbol: '图' },
];
function subjectIconKey(subject) {
  return subjectIcons.get(subject.id) ?? (/c\+\+|编程/i.test(subject.name) ? 'code' : /数学|概率/.test(subject.name) ? 'math' : /结构/.test(subject.name) ? 'tree' : 'folder');
}
function subjectIconSymbol(subject, preset) {
  if (subjectIconKey(subject) === 'folder') return subject.name.trim().slice(0, 1).toLocaleUpperCase() || preset.symbol;
  return preset.symbol;
}
const drafts = new Map();
const pendingSends = new Map();
const saving = new Map();
const messageVersions = new Map();
const mobile = matchMedia('(max-width: 700px)');
let navigationVersion = 0;
const $ = (selector) => document.querySelector(selector);
const hide = (selector, value) => { $(selector).hidden = value; };
const text = (selector, value) => { $(selector).textContent = value; };

const api = (path, options) => dataSource.request(path, options);
async function realLocalRequest(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(path, {
      method, signal: controller.signal,
      headers: { 'x-yixue-dev-user': 'user-a', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const code = result?.error?.code ?? `HTTP_${response.status}`;
      const hints = { 401: 'DEV_ONLY 身份缺失或无效', 403: '无权访问这个对象', 404: '对象不存在或已删除' };
      throw new Error(`${code}：${hints[response.status] ?? '本地操作未完成'}`);
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('NETWORK_TIMEOUT：请求超时，尚未确认保存；可以重试。');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('BACKEND_UNAVAILABLE：无法连接本地后端，尚未确认保存；可以重试。');
    throw error;
  } finally { clearTimeout(timer); }
}

function errorMessage(error) { text('[data-api-error]', error.message); hide('[data-api-error]', false); }
function clearError() { hide('[data-api-error]', true); text('[data-api-error]', ''); }
function setRoute(path, replace = false) {
  if (replace) { history.replaceState(null, '', `#${path}`); return; }
  if (location.hash === `#${path}`) route();
  else location.hash = path;
}
const conversationRoute = (subjectId, id) => `subjects/${subjectId}${id ? `/conversations/${id}` : ''}`;

function showView(name) {
  for (const key of ['home', 'library', 'subjects']) $(`#${key}-view`).classList.toggle('active', key === name);
  document.querySelectorAll('.main-nav [data-view-link]').forEach(button => button.classList.toggle('active', button.dataset.viewLink === name));
  if (name === 'library') renderLibrary();
}
function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

const libraryCourses = [
  {
    id: "cpp",
    name: "C++",
    meta: "3 份资料",
    resources: [
      { name: "2025 C++ 期末试卷.pdf", type: "试卷", year: "2025", keywords: "exam final" },
      { name: "STL 容器与迭代器复习.pdf", type: "复习", year: "2024", keywords: "iterator erase stl" },
      { name: "模板与多态代码示例.zip", type: "代码", year: "2024", keywords: "template virtual code" },
    ],
  },
  {
    id: "math",
    name: "高等数学",
    meta: "2 份资料",
    resources: [
      { name: "高等数学（上）期末卷.pdf", type: "试卷", year: "2025", keywords: "exam final" },
      { name: "极限与连续复习提纲.pdf", type: "复习", year: "2024", keywords: "limit continuity" },
    ],
  },
  {
    id: "data-structure",
    name: "数据结构",
    meta: "2 份资料",
    resources: [
      { name: "树与图习题整理.pdf", type: "习题", year: "2025", keywords: "tree graph" },
      { name: "实验参考代码.zip", type: "代码", year: "2024", keywords: "lab code" },
    ],
  },
];
const libraryState = { tab: "public", query: "", courseId: "cpp", pickedFile: "" };

function renderLibrary() {
  document.querySelectorAll("[data-library-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.libraryTab === libraryState.tab);
    button.setAttribute("aria-current", String(button.dataset.libraryTab === libraryState.tab));
  });
  document.querySelectorAll("[data-library-panel]").forEach(panel => {
    panel.hidden = panel.dataset.libraryPanel !== libraryState.tab;
  });
  renderLibraryPublic();
  renderLibrarySubmission();
}

function renderLibraryPublic() {
  const list = document.querySelector("[data-library-course-list]");
  const detail = document.querySelector("[data-library-course-detail]");
  if (!list || !detail) return;
  const query = libraryState.query.trim().toLocaleLowerCase();
  const courses = libraryCourses.filter(course => {
    const resourceText = course.resources.map(resource => `${resource.name} ${resource.type} ${resource.year} ${resource.keywords}`).join(" ");
    return `${course.name} ${course.meta} ${resourceText}`.toLocaleLowerCase().includes(query);
  });
  if (!courses.some(course => course.id === libraryState.courseId)) libraryState.courseId = courses[0]?.id ?? "";
  list.replaceChildren();
  if (!courses.length) list.append(node("p", "local-note", "没有匹配的课程或资料。"));
  for (const course of courses) {
    const button = node("button", "library-course-card");
    button.type = "button";
    button.dataset.libraryCourse = course.id;
    button.setAttribute("aria-current", String(course.id === libraryState.courseId));
    const copy = node("span", "");
    copy.append(node("strong", "", course.name), node("span", "", `${course.meta} · ${course.resources.map(resource => resource.type).join(" / ")}`));
    button.append(copy, node("em", "", "查看"));
    list.append(button);
  }
  const selected = courses.find(course => course.id === libraryState.courseId);
  detail.replaceChildren();
  detail.hidden = !selected;
  if (!selected) return;
  const selectedResources = query
    ? selected.resources.filter(resource => `${resource.name} ${resource.type} ${resource.year} ${resource.keywords}`.toLocaleLowerCase().includes(query))
    : selected.resources;
  const resourcesToShow = selectedResources.length ? selectedResources : selected.resources;
  const head = node("div", "library-detail-head");
  head.append(node("h3", "", selected.name), node("p", "local-note", "课程内只使用类型、年份等辅助信息帮助判断。"));
  const table = node("div", "library-resource-table");
  const tableHead = node("div", "library-resource-row is-head");
  tableHead.append(node("span", "", "资料"), node("span", "", "类型"), node("span", "", "年份"));
  table.append(tableHead);
  for (const resource of resourcesToShow) {
    const row = node("button", "library-resource-row");
    row.type = "button";
    row.dataset.libraryResource = resource.name;
    row.append(node("span", "", resource.name), node("span", "", resource.type), node("span", "", resource.year));
    table.append(row);
  }
  detail.append(head, table);
}

function renderLibrarySubmission() {
  const list = document.querySelector("[data-submission-list]");
  const status = document.querySelector("[data-submission-status]");
  if (!list || !status) return;
  list.replaceChildren();
  const existing = node("div", "file-row");
  existing.append(node("span", "file-icon", "PDF"));
  const copy = node("div", "");
  copy.append(node("strong", "", "C++ 复习资料.pdf"), node("span", "", "审核中 · 投稿资料独立于私人资料"));
  existing.append(copy, node("span", "status muted", "审核中"));
  list.append(existing);
  status.textContent = libraryState.pickedFile
    ? `已选择：${libraryState.pickedFile}。本阶段只展示待提交状态，不执行上传。`
    : "";
}

function renderSubjectIndex() {
  const list = $('[data-subject-list]');
  list.replaceChildren();
  hide('[data-subject-loading]', !ui.loadingSubjects);
  if (!ui.loadingSubjects && !ui.subjects.length) list.append(node('p', 'local-note', '还没有学科，添加一个学科开始。'));
  const matches = ui.subjects.filter(subject => subject.name.toLocaleLowerCase().includes(ui.subjectQuery.trim().toLocaleLowerCase()));
  if (!ui.loadingSubjects && ui.subjects.length && !matches.length) list.append(node('p', 'local-note', '没有匹配的学科。'));
  for (const subject of matches) {
    const item = node('div', 'r1-subject-item');
    const button = node('button', 'r1-subject-entry');
    button.dataset.subjectId = subject.id;
    button.setAttribute('aria-label', subject.name);
    button.setAttribute('aria-current', String(subject.id === ui.subject?.id));
    const preset = iconPresets.find(icon => icon.key === subjectIconKey(subject));
    const icon = node('span', `r1-subject-icon icon-${preset.key}`, subjectIconSymbol(subject, preset));
    icon.dataset.subjectIcon = ''; icon.setAttribute('aria-hidden', 'true');
    const name = node('span', 'r1-subject-name', subject.name); name.dataset.subjectName = '';
    button.append(icon, name);
    const customize = node('button', 'r1-icon-customize', '⋯');
    customize.dataset.chooseSubjectIcon = subject.id;
    customize.setAttribute('aria-label', `更换 ${subject.name} 图标`);
    item.append(button, customize); list.append(item);
  }
}
function openIconPicker(subjectId) {
  const subject = ui.subjects.find(subject => subject.id === subjectId);
  if (!subject) return;
  const dialog = $('[data-subject-icon-dialog]'); dialog.dataset.iconSubjectId = subjectId;
  text('[data-icon-subject-name]', `更换 ${subject.name} 图标`);
  const choices = $('[data-icon-choices]'); choices.replaceChildren();
  for (const preset of iconPresets) {
    const choice = node('button', 'r1-icon-choice'); choice.dataset.iconKey = preset.key;
    choice.setAttribute('aria-label', preset.label);
    choice.setAttribute('aria-pressed', String(preset.key === subjectIconKey(subject)));
    const symbol = node('span', '', preset.symbol); symbol.setAttribute('aria-hidden', 'true');
    choice.append(symbol, node('small', '', preset.label)); choices.append(choice);
  }
  dialog.showModal();
}
function renderNavigation() {
  const visible = mobile.matches ? ui.mobileOpen : true;
  hide('[data-conversation-nav]', !visible);
  hide('[data-nav-scrim]', !mobile.matches || !ui.mobileOpen);
  $('.r1-learning').classList.toggle('nav-collapsed', !visible);
  const toggle = $('[data-nav-toggle]');
  toggle.setAttribute('aria-expanded', String(visible));
  toggle.setAttribute('aria-label', visible ? '收起对话列表' : '展开对话列表');
  toggle.textContent = '☰ 对话';
  hide('[data-nav-close]', !mobile.matches);
}
function renderConversationList() {
  const list = $('[data-conversation-list]');
  list.replaceChildren();
  hide('[data-conversation-loading]', !ui.loadingConversations);
  const currentEmpty = !!ui.conversation && !ui.loadingMessages && ui.messages.length === 0;
  $('[data-new-conversation]').disabled = !ui.subject || ui.loadingConversations || ui.creating || currentEmpty;
  $('[data-new-conversation]').textContent = ui.creating ? '正在创建…' : currentEmpty ? '先开始当前对话' : '+ 新对话';
  if (!ui.loadingConversations && !ui.conversations.length) list.append(node('p', 'local-note', '还没有对话'));
  const now = new Date(dataSource.now ?? Date.now());
  const day = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  let previousGroup;
  for (const conversation of ui.conversations) {
    const at = new Date(conversation.updated_at);
    const distance = Math.round((day(now) - day(at)) / 86400000);
    const group = distance === 0 ? '今天' : distance === 1 ? '昨天' : '更早';
    if (group !== previousGroup) { list.append(node('h3', 'r1-history-group', group)); previousGroup = group; }
    const button = node('button', 'r1-conversation-entry');
    button.dataset.conversationId = conversation.id;
    button.setAttribute('aria-current', String(conversation.id === ui.conversation?.id));
    button.append(node('strong', '', conversation.title));
    const time = node('time', '', at.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    time.dateTime = conversation.updated_at;
    button.append(time);
    list.append(button);
  }
}
function renderMessages() {
  const list = $('[data-messages]');
  list.replaceChildren();
  if (!ui.loadingMessages && !ui.messages.length) list.append(node('p', 'r1-empty-conversation', ui.conversation ? '这段对话还没有消息。写下新的问题吧。' : '选择已有对话，或新建一段对话。'));
  for (const message of ui.messages) {
    const article = node('article', message.role === 'assistant' ? 'r1-assistant-message' : 'r1-user-message', message.content);
    article.dataset.messageId = message.id;
    article.dataset.messageRole = message.role;
    list.append(article);
  }
}
function renderWorkspace() {
  text('[data-current-subject]', ui.subject?.name ?? '正在读取学科…');
  const title = $('[data-current-conversation]');
  title.textContent = ui.conversation?.title ?? '选择或新建对话';
  if (ui.conversation) title.dataset.conversationId = ui.conversation.id;
  else delete title.dataset.conversationId;
  text('[data-message-target]', ui.conversation ? `${ui.subject.name} · 当前对话` : '尚未选择对话');
  hide('[data-message-loading]', !ui.loadingMessages);
  const busy = saving.has(ui.conversation?.id);
  $('[data-message-input]').disabled = !ui.conversation || ui.loadingMessages || ui.deleting || busy;
  $('[data-message-input]').value = drafts.get(ui.conversation?.id) ?? '';
  $('[data-send-message]').disabled = $('[data-message-input]').disabled;
  text('[data-send-message]', busy ? '保存中…' : '发送');
  text('[data-save-status]', busy ? '正在保存当前对话消息…' : '');
  text('[data-model-status]', ui.messages.length ? '当前本地阶段已保存消息，AI 回答将在下一阶段接入。' : '本地开发阶段未接入 AI；这里只保存用户消息。');
  $('[data-delete-conversation]').disabled = !ui.conversation || ui.loadingMessages || ui.deleting;
  renderMessages();
  renderConversationList();
  renderNavigation();
  productDemo?.render(ui);
  document.querySelectorAll('[data-subject-panel]').forEach(panel => { panel.hidden = panel.dataset.subjectPanel !== ui.tab; panel.classList.toggle('active', !panel.hidden); });
  document.querySelectorAll('[data-subject-tab]').forEach(button => { button.classList.toggle('active', button.dataset.subjectTab === ui.tab); button.setAttribute('aria-current', String(button.dataset.subjectTab === ui.tab)); });
}

async function route() {
  const version = ++navigationVersion;
  const parts = location.hash.slice(1).split('/');
  const view = parts[0] || 'home';
  clearError();
  $('[data-subject-dialog]').close();
  $('[data-subject-icon-dialog]').close();
  $('[data-future-dialog]').close();
  ui.mobileOpen = false;
  productDemo?.closeDialogs();
  if (!['subjects', 'home', 'library'].includes(view)) { showView('subjects'); errorMessage(new Error('ROUTE_NOT_FOUND：页面不存在')); return; }
  showView(view);
  if (view !== 'subjects') return;
  const subjectId = parts[1];
  hide('[data-subject-index]', !!subjectId);
  hide('[data-subject-workspace]', !subjectId);
  if (!subjectId) {
    ui.loadingSubjects = true; ui.subjects = []; renderSubjectIndex();
    try { const result = await api('/api/subjects'); if (version === navigationVersion) ui.subjects = result.subjects; }
    catch (error) { if (version === navigationVersion) errorMessage(error); }
    finally { if (version === navigationVersion) { ui.loadingSubjects = false; renderSubjectIndex(); } }
    return;
  }
  ui.subject = null; ui.conversation = null; ui.conversations = []; ui.messages = [];
  ui.loadingConversations = true; ui.loadingMessages = true; ui.tab = 'learn'; renderWorkspace();
  try {
    const [spaces, chats] = await Promise.all([api('/api/subjects'), api(`/api/subjects/${encodeURIComponent(subjectId)}/conversations`)]);
    if (version !== navigationVersion) return;
    ui.subjects = spaces.subjects;
    ui.subject = spaces.subjects.find(subject => subject.id === subjectId);
    if (!ui.subject) throw new Error('SUBJECT_NOT_FOUND：学科不存在');
    ui.conversations = chats.conversations;
    ui.loadingConversations = false;
    let id = parts[2] === 'conversations' ? parts[3] : null;
    if (parts.length > 2 && (!id || parts[2] !== 'conversations' || parts.length > 4)) throw new Error('ROUTE_NOT_FOUND：对话路径无效');
    id ??= chats.conversations[0]?.id;
    renderWorkspace();
    if (id) {
      let messageVersion = messageVersions.get(id) ?? 0;
      const [chat, initialMessages] = await Promise.all([api(`/api/conversations/${encodeURIComponent(id)}`), api(`/api/conversations/${encodeURIComponent(id)}/messages`)]);
      let result = initialMessages;
      // A confirmed send can finish while this route's older read is in flight.
      // Re-read from the API instead of letting an old snapshot erase that write.
      while (version === navigationVersion && messageVersion !== (messageVersions.get(id) ?? 0)) {
        messageVersion = messageVersions.get(id) ?? 0;
        result = await api(`/api/conversations/${encodeURIComponent(id)}/messages`);
      }
      if (version !== navigationVersion) return;
      if (chat.conversation.subject_space_id !== subjectId) throw new Error('SUBJECT_CONVERSATION_MISMATCH：该对话不属于当前学科');
      ui.conversation = chat.conversation; ui.messages = result.messages;
      productDemo?.conversationLoaded(ui);
      setRoute(conversationRoute(subjectId, id), true);
    }
  } catch (error) { if (version === navigationVersion) { ui.conversation = null; ui.messages = []; errorMessage(error); } }
  finally {
    if (version === navigationVersion) { ui.loadingConversations = false; ui.loadingMessages = false; renderWorkspace(); }
  }
}

async function createConversation() {
  if (!ui.subject || ui.creating) return;
  if (ui.conversation && !ui.loadingMessages && ui.messages.length === 0) {
    text('[data-save-status]', '先在当前新对话里发出第一条消息，再创建下一段对话。');
    $('[data-message-input]').focus();
    return;
  }
  const subjectId = ui.subject.id;
  const version = navigationVersion;
  ui.creating = true; clearError(); renderConversationList();
  try {
    const result = await api(`/api/subjects/${subjectId}/conversations`, { method: 'POST', body: {} });
    if (version === navigationVersion) setRoute(conversationRoute(subjectId, result.conversation.id));
  } catch (error) { if (version === navigationVersion) errorMessage(error); }
  finally { ui.creating = false; renderConversationList(); }
}
async function deleteConversation() {
  if (!ui.conversation || ui.deleting || !confirm('删除这段对话？删除后将无法从列表重新打开。')) return;
  const { id, subject_space_id: subjectId } = ui.conversation;
  const version = navigationVersion;
  ui.deleting = true; clearError(); renderWorkspace();
  try {
    await api(`/api/conversations/${id}`, { method: 'DELETE' });
    drafts.delete(id); pendingSends.delete(id);
    if (version === navigationVersion) setRoute(conversationRoute(subjectId));
  } catch (error) { if (version === navigationVersion) errorMessage(error); }
  finally { ui.deleting = false; renderWorkspace(); }
}

// One delegated path for every dynamically rendered subject/conversation row.
document.addEventListener('click', (event) => {
  const button = event.target.closest('button, a');
  if (!button) return;
  if (productDemo?.handleClick(button, ui)) return;
  if (button.matches('[data-home-action]')) {
    if (button.dataset.homeAction === 'accept') calendarState.candidateAccepted = true;
    if (button.dataset.homeAction === 'adjust') calendarState.lastUserInput = '想再调整一下：今晚只留 30 分钟。';
    if (button.dataset.homeAction === 'reset') {
      calendarState.candidateAccepted = false;
      calendarState.candidateVisible = false;
      calendarState.lastUserInput = '';
    }
    renderCalendar(); renderHomeThread();
  }
  else if (button.matches('[data-library-tab]')) { libraryState.tab = button.dataset.libraryTab; renderLibrary(); }
  else if (button.matches('[data-library-course]')) { libraryState.courseId = button.dataset.libraryCourse; renderLibrary(); }
  else if (button.matches('[data-library-resource]')) {
    button.blur();
    const status = document.querySelector('[data-submission-status]');
    if (status) status.textContent = `已打开示例：${button.dataset.libraryResource}。本阶段不下载文件，也不会自动进入学习对话。`;
  }
  else if (button.matches('[data-pick-submission]')) document.querySelector('[data-submission-file]')?.click();
  else if (button.matches('[data-planner-subject]')) {
    plannerState.selectedSubjectId = button.dataset.plannerSubject;
    plannerState.editing = false;
    plannerState.draft = currentPlannerText();
    plannerState.plan = null;
    plannerState.status = "";
    renderPlannerDialog();
  }
  else if (button.matches('[data-planner-action]')) {
    const action = button.dataset.plannerAction;
    if (action === 'state-edit') { plannerState.editing = true; plannerState.draft = currentPlannerText(); }
    if (action === 'state-cancel') { plannerState.editing = false; plannerState.draft = currentPlannerText(); }
    if (action === 'state-adopt' && plannerState.draft.trim()) {
      plannerState.stateOverrides[plannerState.selectedSubjectId] = plannerState.draft.trim();
      plannerState.editing = false;
      plannerState.status = "已在本页会话中采用这份现状。";
    }
    if (action === 'plan-all') {
      const plan = generatePlannerOverallPlan();
      plannerState.plan = plan;
      plannerState.status = "";
      plannerState.messages.push(
        { role: "user", content: "根据全部学科现状，帮我安排下一步。" },
        { role: "assistant", content: `${plan.reason} 建议排：${plan.time}，${plan.task}。` },
      );
    }
    if (action === 'schedule') schedulePlannerPlan();
    if (action === 'adjust') {
      plannerState.input = "把安排压缩到 30 分钟，并保留最关键的一步。";
      plannerState.plan = { ...generatePlannerPlan(plannerState.input), time: "21:00 - 21:30" };
      plannerState.messages.push({ role: "user", content: plannerState.input }, { role: "assistant", content: `可以缩短为 ${plannerState.plan.time}，只做「${plannerState.plan.task}」中的一个最小练习。` });
    }
    renderPlannerDialog();
  }
  else if (button.matches('[data-view-link]')) { event.preventDefault(); setRoute(button.dataset.viewLink); }
  else if (button.matches('[data-subject-id]')) setRoute(conversationRoute(button.dataset.subjectId));
  else if (button.matches('[data-conversation-id]')) { if (ui.subject) setRoute(conversationRoute(ui.subject.id, button.dataset.conversationId)); }
  else if (button.matches('[data-subject-home]')) setRoute('subjects');
  else if (button.matches('[data-new-conversation]')) createConversation();
  else if (button.matches('[data-delete-conversation]')) deleteConversation();
  else if (button.matches('[data-subject-tab]')) { ui.tab = button.dataset.subjectTab; ui.mobileOpen = false; productDemo?.tabChanged(ui.tab, ui); renderWorkspace(); }
  else if (button.matches('[data-nav-toggle]')) { if (mobile.matches) ui.mobileOpen = !ui.mobileOpen; else ui.desktopCollapsed = !ui.desktopCollapsed; renderNavigation(); }
  else if (button.matches('[data-nav-close], [data-nav-scrim]')) {
    if (mobile.matches) ui.mobileOpen = false;
    else ui.desktopCollapsed = true;
    renderNavigation();
    $('[data-nav-toggle]').focus();
  }
  else if (button.matches('[data-add-subject]')) { $('[data-subject-form]').reset(); hide('[data-create-subject-error]', true); $('[data-subject-dialog]').showModal(); }
  else if (button.matches('[data-choose-subject-icon]')) openIconPicker(button.dataset.chooseSubjectIcon);
  else if (button.matches('[data-icon-key]')) {
    const dialog = $('[data-subject-icon-dialog]');
    if (dialog.open && ui.subjects.some(subject => subject.id === dialog.dataset.iconSubjectId) && iconPresets.some(icon => icon.key === button.dataset.iconKey)) {
      subjectIcons.set(dialog.dataset.iconSubjectId, button.dataset.iconKey); dialog.close(); renderSubjectIndex();
      Array.from(document.querySelectorAll('[data-choose-subject-icon]')).find(control => control.dataset.chooseSubjectIcon === dialog.dataset.iconSubjectId)?.focus();
    }
  }
  else if (button.matches('[data-close-dialog]')) button.closest('dialog').close();
  else if (button.matches('[data-future-state]')) openPlannerDialog();
});
$('[data-subject-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('[type="submit"]');
  if (button.disabled) return;
  button.disabled = true; button.textContent = '正在创建…'; hide('[data-create-subject-error]', true);
  try {
    await api('/api/subjects', { method: 'POST', body: { name: event.target.elements.name.value } });
    $('[data-subject-dialog]').close(); setRoute('subjects');
  } catch (error) { text('[data-create-subject-error]', error.message); hide('[data-create-subject-error]', false); }
  finally { button.disabled = false; button.textContent = '创建学科'; }
});
$('[data-message-input]').addEventListener('input', (event) => { if (ui.conversation) drafts.set(ui.conversation.id, event.target.value); });
$('[data-subject-search]').addEventListener('input', event => { ui.subjectQuery = event.target.value; renderSubjectIndex(); });
document.querySelector('[data-planner-state-view]')?.addEventListener('input', event => {
  if (event.target.matches('[data-planner-state-input]')) plannerState.draft = event.target.value;
});
document.querySelector('[data-planner-subjects]')?.addEventListener('input', event => {
  if (!event.target.matches('[data-planner-subject-search]')) return;
  plannerState.subjectQuery = event.target.value;
  renderPlannerDialog();
  document.querySelector('[data-planner-subject-search]')?.focus();
});
document.querySelector('[data-planner-input]')?.addEventListener('input', event => { plannerState.input = event.target.value; });
document.querySelector('[data-planner-form]')?.addEventListener('submit', event => {
  event.preventDefault();
  const content = plannerState.input.trim();
  if (!content) return;
  const plan = generatePlannerPlan(content);
  plannerState.messages.push({ role: 'user', content }, { role: 'assistant', content: `${plan.reason} 建议排：${plan.time}，${plan.task}。` });
  plannerState.plan = plan;
  plannerState.input = '';
  plannerState.status = '';
  renderPlannerDialog();
});
document.querySelector('[data-library-search]')?.addEventListener('input', event => { libraryState.query = event.target.value; renderLibrary(); });
document.querySelector('[data-submission-file]')?.addEventListener('change', event => {
  libraryState.pickedFile = event.target.files?.[0]?.name ?? '';
  renderLibrarySubmission();
});
async function sendCurrentMessage(content) {
  if (!ui.conversation || ui.loadingMessages || ui.deleting || saving.has(ui.conversation.id)) return false;
  const { id, subject_space_id: subjectId } = ui.conversation;
  let saved = false;
  const version = navigationVersion;
  if (!content.trim()) { errorMessage(new Error('INVALID_INPUT：消息不能为空')); return; }
  const previous = pendingSends.get(id);
  const submission = previous?.content === content ? previous : { content, requestId: crypto.randomUUID() };
  pendingSends.set(id, submission); saving.set(id, submission.requestId); clearError(); renderWorkspace();
  const releaseSaving = () => { if (saving.get(id) === submission.requestId) saving.delete(id); };
  try {
    const result = await api(`/api/conversations/${id}/messages`, { method: 'POST', body: submission });
    saved = true;
    messageVersions.set(id, (messageVersions.get(id) ?? 0) + 1);
    pendingSends.delete(id); drafts.delete(id);
    if (ui.conversation?.id === id) {
      if (!ui.messages.some(message => message.id === result.message.id)) ui.messages.push(result.message);
    }
    releaseSaving(); renderWorkspace();
    // Acknowledged writes and navigation refreshes have different error semantics.
    // The navigation generation also prevents an older list from hiding a new chat.
    if (version === navigationVersion && ui.subject?.id === subjectId) {
      try {
        const chats = await api(`/api/subjects/${subjectId}/conversations`);
        if (version === navigationVersion) ui.conversations = chats.conversations;
      } catch (error) {
        if (version === navigationVersion) errorMessage(new Error(`消息已保存；对话列表未能刷新。${error.message.split('：')[0]}`));
      }
    }
  } catch (error) { if (ui.conversation?.id === id) errorMessage(error); }
  finally { releaseSaving(); renderWorkspace(); }
  return saved;
}
$('[data-message-form]').addEventListener('submit', event => {
  event.preventDefault();
  sendCurrentMessage($('[data-message-input]').value);
});
window.addEventListener('hashchange', route);
mobile.addEventListener('change', () => { ui.mobileOpen = false; renderNavigation(); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (mobile.matches && ui.mobileOpen) ui.mobileOpen = false;
  else if (!mobile.matches && !ui.desktopCollapsed) ui.desktopCollapsed = true;
  else return;
  renderNavigation();
  $('[data-nav-toggle]').focus();
});
productDemo?.mount({
  node, render: renderWorkspace, sendMessage: sendCurrentMessage, isSaving: () => saving.has(ui.conversation?.id),
  openConversation: id => setRoute(conversationRoute(ui.subject.id, id)),
  schedulePlan(plan, source) {
    schedulePlannerPlan(plan, source);
    setRoute('home');
  },
  activateReview(chat) {
    ++navigationVersion;
    ui.conversation = chat; ui.messages = dataSource.messages(chat.id);
    ui.conversations = dataSource.list(ui.subject.id); ui.tab = 'review'; ui.mobileOpen = false;
    setRoute(conversationRoute(ui.subject.id, chat.id), true); renderWorkspace();
  },
});
if (productDemo && !location.hash) setRoute('subjects/demo-cpp/conversations/cpp-erase', true);
route();
