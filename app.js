const viewLinks = document.querySelectorAll("[data-view-link]");
const views = {
  home: document.querySelector("#home-view"),
  library: document.querySelector("#library-view"),
  subjects: document.querySelector("#subjects-view"),
};

const subjectTitle = document.querySelector("#subject-subnav-title");
const subjectSubnav = document.querySelector(".subject-subnav");
const toast = document.querySelector(".toast");
const drawerScrim = document.querySelector(".drawer-scrim");
const timelineShell = document.querySelector("[data-timeline-shell]");
const dateStrip = document.querySelector("[data-date-strip]");
const chatSurface = document.querySelector("[data-chat-surface]");

let toastTimer;
let currentSubject = "cpp";
let currentCourse = "cpp";
let currentStateSubject = "cpp";
let currentConversationId = "erase";

const today = new Date(2026, 8, 28);
const calendarState = {
  selectedDate: new Date(today),
  mode: "day",
  candidateVisible: false,
  candidateAccepted: false,
};

const subjects = {
  cpp: {
    name: "C++",
    state: "C++ 最近在集中处理 STL iterator 相关问题，erase 遍历仍是主要卡点。下一步适合先用少量题目确认写法是否稳定。",
    current: "C++ 最近在集中处理 STL iterator 相关问题。",
    candidate: "继续关注 erase 返回值和旧 iterator 的区别。",
    recentEvidence: "erase 遍历还是容易写错。",
    conversationIds: ["erase", "insert", "virtual"],
    privateFileIds: ["private-stl", "private-final"],
    memoryItems: [
      { id: "erase-loop", title: "erase 遍历", summary: "删除元素后继续使用旧 iterator 的写法仍需要留意。", status: "active" },
      { id: "complexity", title: "复杂度判断", summary: "遇到容器操作时先判断是否会引发元素移动。", status: "active" },
      { id: "iterator-invalid", title: "iterator 失效", summary: "已经理解失效来自容器结构变化，而不是 erase 返回值本身。", status: "inactive" },
    ],
    recapCandidates: [
      { id: "erase-loop", title: "erase 遍历", summary: "删除元素后应使用 erase 返回的新 iterator 继续遍历。", decision: null },
      { id: "iterator-invalid", title: "iterator 失效", summary: "容器结构变化可能使原 iterator 不再指向可安全访问的位置。", decision: null },
    ],
  },
  math: {
    name: "高等数学",
    state: "高等数学最近在复习极限与连续，适合用少量典型题确认定义与图像理解是否稳定。",
    current: "高等数学最近在复习极限与连续。",
    candidate: "下一步用典型题确认极限与连续的判定是否稳定。",
    recentEvidence: "",
    conversationIds: [],
    privateFileIds: [],
    memoryItems: [],
    recapCandidates: [],
  },
  probability: {
    name: "概率论",
    state: "概率论暂时没有新的现状补充，可以在下次学习前先说明当前卡点。",
    current: "概率论暂时没有新的现状补充。",
    candidate: "下次学习前先补充当前章节和卡点。",
    recentEvidence: "",
    conversationIds: [],
    privateFileIds: [],
    memoryItems: [],
    recapCandidates: [],
  },
  ds: {
    name: "数据结构",
    state: "数据结构当前适合围绕树和图的基础操作做一次小范围回顾。",
    current: "数据结构当前适合围绕树和图的基础操作回顾。",
    candidate: "先回顾树和图的基础操作，再决定是否刷题。",
    recentEvidence: "",
    conversationIds: [],
    privateFileIds: [],
    memoryItems: [],
    recapCandidates: [],
  },
};

const courseResources = {
  cpp: {
    title: "C++",
    resources: [
      { id: "cpp-final", title: "2025 C++ 期末试卷.pdf", type: "试卷", year: "2025", copy: "一份用于期末复习的公共试卷资料。" },
      { id: "cpp-stl", title: "STL 容器迭代器速查.pdf", type: "笔记", year: "2024", copy: "整理了常见容器的 iterator 行为和注意点。" },
      { id: "cpp-iterator", title: "iterator 失效整理.pdf", type: "整理", year: "2024", copy: "围绕 iterator 失效场景做的轻量归纳。" },
    ],
  },
  math: {
    title: "高等数学（上）",
    resources: [
      { id: "math-final", title: "高数 2025 期末试卷.pdf", type: "试卷", year: "2025", copy: "高等数学上册期末试卷资料。" },
      { id: "math-limit", title: "极限与连续整理.pdf", type: "笔记", year: "2024", copy: "极限、连续与常见判定的复习整理。" },
    ],
  },
  probability: {
    title: "概率论",
    resources: [
      { id: "prob-formula", title: "概率论公式速查.pdf", type: "整理", year: "2025", copy: "常用公式和分布的速查资料。" },
      { id: "prob-exam", title: "概率论期末样题.pdf", type: "试卷", year: "2024", copy: "用于检查基础题型掌握情况。" },
    ],
  },
  ds: {
    title: "数据结构",
    resources: [
      { id: "ds-tree", title: "树与图基础整理.pdf", type: "笔记", year: "2025", copy: "树、图基础概念和常见操作整理。" },
      { id: "ds-final", title: "数据结构期末复习题.pdf", type: "试卷", year: "2024", copy: "期末复习题和基础算法题。" },
    ],
  },
};

const privateFiles = {
  "private-stl": { subjectKey: "cpp", title: "STL 容器与迭代器.pdf", meta: "私人资料 · PDF · 2024", copy: "这是当前学科内保存的私人资料。" },
  "private-final": { subjectKey: "cpp", title: "C++ 期末复习题.pdf", meta: "私人资料 · PDF", copy: "可在当前学习中作为参考资料使用。" },
};

const submissions = {
  "cpp-review": { title: "C++ 复习资料.pdf", meta: "投稿资料", copy: "当前状态：审核中。审核通过后会作为独立公共资料收录。" },
  "math-final": { title: "高数 2025 期末试卷.pdf", meta: "投稿资料", copy: "当前状态：已收录。收录后已生成独立公共资料。" },
};

const conversations = {
  erase: {
    subjectKey: "cpp",
    title: "vector erase 后 iterator 为什么失效",
    updatedAt: "今天 20:12",
    messages: [
      ["user", "erase 不是返回一个元素吗，为什么会和 iterator 失效有关？"],
      ["ai", "这里先区分两件事：erase 的返回值可继续使用，但被删除位置之后原有的 iterator 可能已经失效。"],
    ],
  },
  insert: {
    subjectKey: "cpp",
    title: "insert 到底返回什么",
    updatedAt: "昨天 22:04",
    messages: [
      ["user", "insert 到底返回什么？"],
      ["ai", "多数 STL 容器的 insert 会返回指向新插入元素的 iterator，但是否导致其他 iterator 失效，要看具体容器和插入位置。"],
    ],
  },
  virtual: {
    subjectKey: "cpp",
    title: "虚析构为什么需要 virtual",
    updatedAt: "9 月 26 日",
    messages: [
      ["user", "虚析构为什么需要 virtual？"],
      ["ai", "当你通过基类指针删除派生类对象时，virtual 析构能保证派生类析构逻辑也被执行。"],
    ],
  },
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

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
    const offset = index - 2;
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
    const weekStart = addDays(calendarState.selectedDate, -calendarState.selectedDate.getDay() + 1);
    rows.push('<div class="week-overview" aria-label="周视图">');
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(weekStart, i);
      const isSelected = dayDiff(date, calendarState.selectedDate) === 0;
      rows.push(`<button class="${isSelected ? "active" : ""}" data-week-date="${i}"><strong>${date.getDate()}</strong><span>${getDayLabel(date)}</span></button>`);
    }
    rows.push("</div>");
  }

  for (let hour = 8; hour <= 23; hour += 1) {
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
      content = `<article class="calendar-block ${acceptedClass}" data-home-candidate>${label}<strong>C++ iterator 复习</strong><span>21:00 - 22:00</span></article>`;
    }

    rows.push(`<div class="${rowClass.join(" ")}"><span>${time}</span>${content}</div>`);
  }

  timelineShell.innerHTML = rows.join("");
  timelineShell.setAttribute("aria-label", `${calendarState.selectedDate.getMonth() + 1}月${calendarState.selectedDate.getDate()}日日程`);
}

function renderCalendar() {
  renderDateStrip();
  renderTimeline();
  document.querySelectorAll("[data-calendar-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.calendarMode === calendarState.mode);
  });
}

function showView(name) {
  Object.entries(views).forEach(([key, node]) => {
    node.classList.toggle("active", key === name);
  });
  document.querySelectorAll(".nav-pill").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewLink === name);
  });
}

function showLibraryPanel(name) {
  document.querySelectorAll("[data-library-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.libraryPanel === name);
  });
  document.querySelectorAll("[data-library-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.libraryTab === name);
  });
}

function renderCourseResources(resources) {
  const list = document.querySelector("[data-course-resources]");
  list.innerHTML = resources
    .map(
      (resource) => `<div class="file-row" data-resource-title="${resource.title}">
        <span class="file-icon">PDF</span>
        <div><strong>${resource.title}</strong><span>${resource.type} · ${resource.year}</span></div>
        <button data-open-file="${resource.id}">查看</button>
      </div>`,
    )
    .join("");
}

function renderCourse(courseKey = currentCourse) {
  currentCourse = courseKey;
  const course = courseResources[courseKey] ?? courseResources.cpp;
  document.querySelector("[data-course-title]").textContent = course.title;
  const search = document.querySelector("[data-course-search]");
  search.placeholder = `搜索 ${course.title} 资料……`;
  search.value = "";
  renderCourseResources(course.resources);
  showLibraryPanel("course");
}

function filterCourseResources(query = "") {
  const course = courseResources[currentCourse] ?? courseResources.cpp;
  const normalized = query.trim().toLowerCase();
  const resources = normalized
    ? course.resources.filter((resource) => `${resource.title} ${resource.type} ${resource.year}`.toLowerCase().includes(normalized))
    : course.resources;
  renderCourseResources(resources);
}

function getSubject(subjectKey = currentSubject) {
  return subjects[subjectKey] ?? subjects.cpp;
}

function getSubjectConversations(subjectKey = currentSubject) {
  const subject = getSubject(subjectKey);
  return (subject.conversationIds ?? [])
    .map((id) => ({ id, ...conversations[id] }))
    .filter((conversation) => Array.isArray(conversation.messages));
}

function renderReviewHome() {
  const subject = getSubject();
  const allRecent = getSubjectConversations();
  const recent = allRecent.slice(0, 3);
  const recentList = document.querySelector("[data-review-recent]");
  const recentCount = document.querySelector("[data-review-recent-count]");
  if (recentCount) recentCount.textContent = `最近有 ${allRecent.length} 个对话`;
  if (recentList) {
    recentList.innerHTML = recent.length
      ? recent.map((conversation) => `<li><button class="inline-row review-conversation-row" data-open-conversation="${conversation.id}"><strong>${escapeHTML(conversation.title)}</strong><span>${escapeHTML(conversation.updatedAt || "")}</span></button></li>`).join("")
      : '<li class="empty-copy">还没有学习对话。</li>';
  }
  const active = (subject.memoryItems ?? []).filter((item) => item.status === "active");
  const inactive = (subject.memoryItems ?? []).filter((item) => item.status === "inactive");
  const renderMemory = (items, emptyText) => items.length
    ? items.map((item) => `<div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.summary)}</p></div>`).join("")
    : `<p class="empty-copy">${emptyText}</p>`;
  const preview = document.querySelector("[data-review-memory-preview]");
  const activeList = document.querySelector("[data-review-memory-active]");
  const inactiveList = document.querySelector("[data-review-memory-inactive]");
  if (preview) preview.innerHTML = renderMemory(active.slice(0, 2), "当前没有需要继续关注的内容。");
  if (activeList) activeList.innerHTML = renderMemory(active, "当前没有需要继续关注的内容。");
  if (inactiveList) inactiveList.innerHTML = renderMemory(inactive, "还没有已形成认识的内容。");
}

function renderHistoryDrawer() {
  const list = document.querySelector("[data-history-list]");
  if (!list) return;
  const recent = getSubjectConversations();
  list.innerHTML = recent.length
    ? recent.map((conversation) => `<button data-open-conversation="${conversation.id}"><strong>${escapeHTML(conversation.title)}</strong><span>${escapeHTML(conversation.updatedAt || "")}</span></button>`).join("")
    : '<p class="empty-copy">这个学科还没有历史对话。</p>';
}

function renderRecapReferences() {
  const container = document.querySelector("[data-recap-references]");
  if (!container) return;
  const recent = getSubjectConversations().slice(0, 3);
  container.innerHTML = recent.length
    ? recent.map((conversation, index) => `<label><input type="checkbox" ${index < 2 ? "checked" : ""} /> ${escapeHTML(conversation.title)}</label>`).join("")
    : '<p class="empty-copy">还没有最近对话，可以直接填写上面的复盘内容。</p>';
}

function renderRecapCandidates() {
  const subject = getSubject();
  const title = document.querySelector("[data-candidate-memory-title]");
  const container = document.querySelector("[data-candidate-memory]");
  if (!container) return;
  const visible = (subject.recapCandidates ?? []).filter((candidate) => candidate.decision !== "ignored");
  if (title) {
    title.textContent = visible.length
      ? `这次有 ${visible.length} 条内容可能值得留下`
      : "这次暂时没有可确认的候选内容";
  }
  container.innerHTML = visible.length
    ? visible.map((candidate) => `
      <article class="${candidate.decision === "kept" ? "kept" : ""}" data-memory-id="${candidate.id}">
        <strong>${escapeHTML(candidate.title)}</strong>
        <p>${escapeHTML(candidate.summary)}</p>
        <div>
          <button data-memory-action="edit">编辑</button>
          <button data-memory-action="ignore">忽略</button>
          <button data-memory-action="keep" ${candidate.decision === "kept" ? "disabled" : ""}>${candidate.decision === "kept" ? "已保留" : "保留"}</button>
        </div>
      </article>`).join("")
    : '<p class="empty-copy">当前静态原型没有生成新的候选内容。</p>';
}

function renderPrivateResources() {
  const subject = getSubject();
  const list = document.querySelector("[data-private-resources]");
  const title = document.querySelector("[data-subject-files-title]");
  if (title) title.textContent = `${subject.name} 资料`;
  if (!list) return;
  const files = (subject.privateFileIds ?? []).map((id) => ({ id, ...privateFiles[id] })).filter((file) => file.title);
  list.innerHTML = files.length
    ? files.map((file) => {
        const ext = file.title.includes(".") ? file.title.split(".").pop().toUpperCase() : "FILE";
        return `<div class="file-row">
          <span class="file-icon">${escapeHTML(ext)}</span>
          <div><strong>${escapeHTML(file.title)}</strong><span>${escapeHTML(file.meta.replace("私人资料 · ", ""))}</span></div>
          <button class="more-btn" data-open-file="${file.id}">⋯</button>
        </div>`;
      }).join("")
    : '<p class="empty-copy resource-empty">还没有私人资料。</p>';
}

function summarizeState(value) {
  const text = value.trim();
  return text.length > 34 ? `${text.slice(0, 34)}…` : text;
}

function renderStateOverview() {
  const container = document.querySelector("[data-state-overview-list]");
  if (!container) return;
  container.innerHTML = Object.entries(subjects).map(([key, subject]) => `
    <button class="state-row" data-state-detail="${key}">
      <strong>${escapeHTML(subject.name)}</strong>
      <span>${escapeHTML(summarizeState(subject.current))}</span>
      <em>›</em>
    </button>`).join("");
}

function renderSubjectWorkspace() {
  const subject = getSubject();
  document.querySelectorAll("[data-recap-subject]").forEach((node) => {
    node.textContent = subject.name;
  });
  renderReviewHome();
  renderHistoryDrawer();
  renderRecapReferences();
  renderPrivateResources();
  renderStateOverview();
}

function showSubjectPanel(name) {
  document.querySelectorAll("[data-subject-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.subjectPanel === name);
  });
  const tabName = name === "recap" ? "review" : name;
  document.querySelectorAll("[data-subject-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.subjectTab === tabName);
  });
  subjectTitle.textContent = name === "spaces" ? "学科空间" : getSubject().name;
  subjectSubnav.classList.toggle("compact-state", name === "spaces");
  if (name === "review") renderReviewHome();
  if (name === "files") renderPrivateResources();
}

function openSubject(subjectKey) {
  if (!subjects[subjectKey]) return;
  currentSubject = subjectKey;
  currentStateSubject = subjectKey;
  renderSubjectWorkspace();
  const recent = getSubjectConversations(subjectKey);
  if (recent.length) {
    loadConversation(recent[0].id, false);
  } else {
    startNewChat(true);
  }
  showSubjectPanel("learn");
}

function showRecapStep(name) {
  showSubjectPanel("recap");
  document.querySelectorAll("[data-recap-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.recapPanel === name);
  });
  if (name === "setup") renderRecapReferences();
  if (name === "memory") renderRecapCandidates();
}

function updateStateDetail(subjectKey) {
  currentStateSubject = subjectKey;
  const subject = getSubject(subjectKey);
  document.querySelector("[data-state-title]").textContent = subject.name;
  document.querySelector("[data-state-copy]").textContent = subject.state;
  document.querySelector("[data-state-edit-title]").textContent = `${subject.name} · 现状更新`;
  document.querySelector("[data-state-current]").textContent = subject.current;
  document.querySelector("[data-state-candidate]").textContent = subject.candidate;
  document.querySelector("[data-state-textarea]").value = subject.candidate;
  const evidenceWrap = document.querySelector("[data-state-evidence-wrap]");
  const evidence = document.querySelector("[data-state-evidence]");
  if (evidenceWrap && evidence) {
    evidence.textContent = subject.recentEvidence || "";
    evidenceWrap.classList.toggle("hidden", !subject.recentEvidence);
  }
}

function showStatePanel(name) {
  document.querySelectorAll("[data-state-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.statePanel === name);
  });
  if (name === "overview") renderStateOverview();
}

function openDrawer(name, scope) {
  document.querySelectorAll("[data-drawer]").forEach((drawer) => {
    drawer.classList.toggle("active", drawer.dataset.drawer === name);
  });
  if (name === "history") renderHistoryDrawer();
  if (name === "state") {
    if (scope === "subject") {
      updateStateDetail(currentSubject);
      showStatePanel("detail");
    } else {
      showStatePanel("overview");
    }
  }
  drawerScrim.classList.add("active");
}

function closeDrawer() {
  document.querySelectorAll("[data-drawer]").forEach((drawer) => drawer.classList.remove("active"));
  drawerScrim.classList.remove("active");
}

function openFileDrawer(fileId) {
  const publicResource = Object.values(courseResources)
    .flatMap((course) => course.resources)
    .find((resource) => resource.id === fileId);
  const file = publicResource
    ? { title: publicResource.title, meta: `${publicResource.type} · ${publicResource.year}`, copy: publicResource.copy }
    : privateFiles[fileId];
  if (!file) return;
  document.querySelector("[data-file-title]").textContent = file.title;
  document.querySelector("[data-file-meta]").textContent = file.meta;
  document.querySelector("[data-file-copy]").textContent = file.copy;
  openDrawer("file");
}

function openSubmissionDrawer(submissionId) {
  const submission = submissions[submissionId];
  if (!submission) return;
  document.querySelector("[data-submission-title]").textContent = submission.title;
  document.querySelector("[data-submission-meta]").textContent = submission.meta;
  document.querySelector("[data-submission-copy]").textContent = submission.copy;
  openDrawer("submission");
}

function renderConversation(id) {
  const conversation = conversations[id];
  if (!conversation) return;
  chatSurface.innerHTML = conversation.messages
    .map(([role, text]) => `<div class="chat-message ${role}"><p>${escapeHTML(text)}</p></div>`)
    .join("");
}

function loadConversation(id, switchToLearn = true) {
  const conversation = conversations[id];
  if (!conversation) return;
  if (conversation.subjectKey && subjects[conversation.subjectKey]) {
    currentSubject = conversation.subjectKey;
    currentStateSubject = conversation.subjectKey;
  }
  currentConversationId = id;
  renderSubjectWorkspace();
  renderConversation(id);
  if (switchToLearn) {
    showView("subjects");
    showSubjectPanel("learn");
  }
  closeDrawer();
}

function startNewChat(silent = false) {
  currentConversationId = null;
  chatSurface.innerHTML = `<div class="chat-message ai"><p>可以直接开始一个新的问题。当前学科是 ${escapeHTML(getSubject().name)}。</p></div>`;
  if (!silent) showToast("已开始新的空白对话。");
}

function createConversationFromMessage(text) {
  const id = `conversation-${Date.now()}`;
  const title = text.length > 26 ? `${text.slice(0, 26)}…` : text;
  conversations[id] = {
    subjectKey: currentSubject,
    title,
    updatedAt: "刚刚",
    messages: [["user", text]],
  };
  const subject = getSubject();
  subject.conversationIds = [id, ...(subject.conversationIds ?? []).filter((item) => item !== id)];
  currentConversationId = id;
  return id;
}

function appendLearningMessage(text) {
  const subject = getSubject();
  if (!currentConversationId || !conversations[currentConversationId] || conversations[currentConversationId].subjectKey !== currentSubject) {
    createConversationFromMessage(text);
  } else {
    conversations[currentConversationId].messages.push(["user", text]);
    conversations[currentConversationId].updatedAt = "刚刚";
    subject.conversationIds = [currentConversationId, ...(subject.conversationIds ?? []).filter((id) => id !== currentConversationId)];
  }
  renderConversation(currentConversationId);
  renderReviewHome();
  renderHistoryDrawer();
  renderRecapReferences();
}

function applyMemoryAction(button) {
  const action = button.dataset.memoryAction;
  const article = button.closest("article");
  if (!article) return;
  const subject = getSubject();
  const candidate = (subject.recapCandidates ?? []).find((item) => item.id === article.dataset.memoryId);
  if (!candidate) return;

  if (action === "ignore") {
    candidate.decision = "ignored";
    renderRecapCandidates();
    showToast("已忽略这条候选记忆点。");
    return;
  }

  const paragraph = article.querySelector("p");
  const existingEditor = article.querySelector("textarea");
  const currentSummary = existingEditor?.value.trim() || paragraph?.textContent.trim() || candidate.summary;

  if (action === "keep") {
    candidate.summary = currentSummary;
    candidate.decision = "kept";
    const existingItem = (subject.memoryItems ?? []).find((item) => item.id === candidate.id || item.title === candidate.title);
    if (existingItem) {
      existingItem.title = candidate.title;
      existingItem.summary = candidate.summary;
      existingItem.status = "active";
    } else {
      subject.memoryItems.push({ id: candidate.id, title: candidate.title, summary: candidate.summary, status: "active" });
    }
    renderRecapCandidates();
    renderReviewHome();
    showToast("已保留，并同步到回顾页。");
    return;
  }

  if (existingEditor) {
    candidate.summary = existingEditor.value.trim() || candidate.summary;
    const nextParagraph = document.createElement("p");
    nextParagraph.textContent = candidate.summary;
    existingEditor.replaceWith(nextParagraph);
    button.textContent = "编辑";
    return;
  }

  if (!paragraph) return;
  const editor = document.createElement("textarea");
  editor.value = paragraph.textContent;
  editor.className = "memory-editor";
  paragraph.replaceWith(editor);
  button.textContent = "完成";
  editor.focus();
}

function addSubmissionFiles(files) {
  const list = document.querySelector("[data-submissions-list]");
  if (!list || !files.length) return;
  Array.from(files).forEach((file, index) => {
    const id = `uploaded-submission-${Date.now()}-${index}`;
    const safeName = escapeHTML(file.name);
    submissions[id] = {
      title: file.name,
      meta: "投稿资料",
      copy: "当前状态：待提交审核。此处为本次原型会话中的临时选择。",
    };
    list.insertAdjacentHTML(
      "afterbegin",
      `<div class="file-row">
        <span class="doc-icon"></span>
        <strong>${safeName}</strong>
        <span class="status muted">待提交</span>
        <button class="more-btn" data-open-submission="${id}">⋮</button>
      </div>`,
    );
  });
  showToast("已加入我的投稿列表。");
}

function addPrivateFiles(files) {
  if (!files.length) return;
  const subject = getSubject();
  subject.privateFileIds ??= [];
  Array.from(files).forEach((file, index) => {
    const id = `uploaded-private-${Date.now()}-${index}`;
    privateFiles[id] = {
      subjectKey: currentSubject,
      title: file.name,
      meta: `私人资料 · ${file.name.split(".").pop()?.toUpperCase() || "文件"}`,
      copy: "这是本次原型会话中临时加入的私人资料。",
    };
    subject.privateFileIds.unshift(id);
  });
  renderPrivateResources();
  showToast("已加入当前学科资料。");
}

function addSubject() {
  const name = window.prompt("学科名称");
  if (!name?.trim()) return;
  const key = `custom-${Date.now()}`;
  const cleanName = name.trim();
  subjects[key] = {
    name: cleanName,
    state: `${cleanName} 还没有新的现状补充。`,
    current: `${cleanName} 还没有新的现状补充。`,
    candidate: "先补充当前目标、最近学习内容或主要卡点。",
    recentEvidence: "",
    conversationIds: [],
    privateFileIds: [],
    memoryItems: [],
    recapCandidates: [],
  };
  document.querySelector(".subject-grid")?.insertAdjacentHTML(
    "beforeend",
    `<button class="course-card" data-open-subject="${key}"><strong>${escapeHTML(cleanName)}</strong></button>`,
  );
  renderStateOverview();
  showToast("已加入学科空间。");
}

viewLinks.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    showView(button.dataset.viewLink);
    if (button.dataset.viewLink === "subjects") showSubjectPanel("spaces");
    if (button.dataset.viewLink === "library") showLibraryPanel("public");
  });
});

document.querySelectorAll("[data-library-tab]").forEach((button) => {
  button.addEventListener("click", () => showLibraryPanel(button.dataset.libraryTab));
});

document.querySelectorAll("[data-subject-tab]").forEach((button) => {
  button.addEventListener("click", () => showSubjectPanel(button.dataset.subjectTab));
});

document.querySelectorAll("[data-open-subject]").forEach((button) => {
  button.addEventListener("click", () => openSubject(button.dataset.openSubject));
});

document.querySelectorAll("[data-subject-home]").forEach((button) => {
  button.addEventListener("click", () => showSubjectPanel("spaces"));
});

document.querySelectorAll("[data-open-course]").forEach((button) => {
  button.addEventListener("click", () => renderCourse(button.dataset.openCourse));
});

document.querySelectorAll("[data-recap-step]").forEach((button) => {
  button.addEventListener("click", () => showRecapStep(button.dataset.recapStep));
});

document.querySelectorAll("[data-open-drawer]").forEach((button) => {
  button.addEventListener("click", () => openDrawer(button.dataset.openDrawer, button.dataset.stateScope));
});

document.querySelectorAll("[data-close-drawer]").forEach((button) => {
  button.addEventListener("click", closeDrawer);
});

document.querySelector("[data-state-edit]")?.addEventListener("click", () => showStatePanel("edit"));

document.querySelector("[data-state-back]")?.addEventListener("click", () => showStatePanel("overview"));

document.querySelector("[data-state-cancel]")?.addEventListener("click", () => {
  updateStateDetail(currentStateSubject);
  showStatePanel("detail");
});

document.querySelector("[data-state-adopt]")?.addEventListener("click", () => {
  const textarea = document.querySelector("[data-state-textarea]");
  const subject = subjects[currentStateSubject] ?? subjects.cpp;
  subject.current = textarea.value.trim() || subject.current;
  subject.state = subject.current;
  updateStateDetail(currentStateSubject);
  renderStateOverview();
  showStatePanel("detail");
  showToast("已采用现状更新。");
});

document.querySelector("[data-memory-toggle]")?.addEventListener("click", (event) => {
  document.querySelector("[data-memory-all]")?.classList.toggle("hidden");
  event.currentTarget.textContent = event.currentTarget.textContent.includes("收起") ? "查看全部 ›" : "收起";
});

document.querySelector("[data-home-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector("input");
  if (input) input.value = "";
  calendarState.candidateVisible = true;
  calendarState.candidateAccepted = false;
  calendarState.selectedDate = new Date(today);
  document.querySelector("[data-home-assist]")?.classList.remove("hidden");
  renderCalendar();
  timelineShell?.scrollTo({ top: timelineShell.scrollHeight, behavior: "smooth" });
});

document.querySelectorAll("[data-home-candidate-action]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.textContent === "采用") {
      calendarState.candidateVisible = true;
      calendarState.candidateAccepted = true;
      document.querySelector("[data-home-assist]")?.classList.add("hidden");
      renderCalendar();
      showToast("候选安排已采用。");
      return;
    }
    showToast("可以继续描述时间或任务变化。");
  });
});

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

timelineShell?.addEventListener(
  "wheel",
  (event) => {
    const atTop = timelineShell.scrollTop <= 0;
    const atBottom = Math.ceil(timelineShell.scrollTop + timelineShell.clientHeight) >= timelineShell.scrollHeight;
    if (event.deltaY < -28 && atTop) {
      calendarState.selectedDate = addDays(calendarState.selectedDate, -1);
      renderCalendar();
      timelineShell.scrollTop = timelineShell.scrollHeight - timelineShell.clientHeight - 4;
    }
    if (event.deltaY > 28 && atBottom) {
      calendarState.selectedDate = addDays(calendarState.selectedDate, 1);
      renderCalendar();
      timelineShell.scrollTop = 4;
    }
  },
  { passive: true },
);

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

document.querySelector("[data-course-search]")?.addEventListener("input", (event) => filterCourseResources(event.target.value));

document.querySelectorAll("[data-course-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const course = courseResources[currentCourse] ?? courseResources.cpp;
    const key = button.dataset.courseFilter;
    const resources = [...course.resources];
    if (key === "type") resources.sort((a, b) => a.type.localeCompare(b.type, "zh-Hans-CN"));
    if (key === "year") resources.sort((a, b) => b.year.localeCompare(a.year));
    if (key === "sort") resources.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
    document.querySelectorAll("[data-course-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderCourseResources(resources);
  });
});

document.querySelectorAll(".library-search-head input, .subject-index-head input, .subject-panel[data-subject-panel='files'] input").forEach((input) => {
  input.addEventListener("input", () => {
    const scope = input.closest(".library-panel, .subject-panel");
    const cards = scope?.querySelectorAll(".course-card");
    const rows = scope?.querySelectorAll(".file-row");
    const query = input.value.trim().toLowerCase();
    cards?.forEach((card) => card.classList.toggle("hidden", !card.textContent.toLowerCase().includes(query)));
    rows?.forEach((row) => row.classList.toggle("hidden", !row.textContent.toLowerCase().includes(query)));
  });
});

document.addEventListener("click", (event) => {
  const stateDetailButton = event.target.closest("[data-state-detail]");
  if (stateDetailButton) {
    updateStateDetail(stateDetailButton.dataset.stateDetail);
    showStatePanel("detail");
    return;
  }

  const subjectButton = event.target.closest("[data-open-subject]");
  if (subjectButton) {
    openSubject(subjectButton.dataset.openSubject);
    return;
  }

  const fileButton = event.target.closest("[data-open-file]");
  if (fileButton) {
    openFileDrawer(fileButton.dataset.openFile);
    return;
  }
  const submissionButton = event.target.closest("[data-open-submission]");
  if (submissionButton) {
    openSubmissionDrawer(submissionButton.dataset.openSubmission);
    return;
  }
  const conversationButton = event.target.closest("[data-open-conversation]");
  if (conversationButton) {
    loadConversation(conversationButton.dataset.openConversation);
    return;
  }
  const memoryButton = event.target.closest("[data-memory-action]");
  if (memoryButton) applyMemoryAction(memoryButton);
});

document.querySelector("[data-new-chat]")?.addEventListener("click", () => startNewChat());

document.querySelector("[data-file-use]")?.addEventListener("click", () => {
  closeDrawer();
  showView("subjects");
  showSubjectPanel("learn");
  showToast("已作为当前学习参考。");
});

document.querySelector("[data-add-subject]")?.addEventListener("click", addSubject);

document.querySelectorAll("[data-upload-trigger]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`[data-upload-input="${button.dataset.uploadTrigger}"]`)?.click();
  });
});

document.querySelectorAll("[data-upload-input]").forEach((input) => {
  input.addEventListener("change", () => {
    if (input.dataset.uploadInput.startsWith("submission")) addSubmissionFiles(input.files);
    if (input.dataset.uploadInput === "private-file") addPrivateFiles(input.files);
    input.value = "";
  });
});

document.querySelectorAll("[data-chat-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("input");
    const text = input?.value.trim();
    if (!text) return;

    if (form.closest("[data-subject-panel='learn']")) {
      appendLearningMessage(text);
      input.value = "";
      showToast("已加入当前对话；回顾页已同步最近学习。");
      return;
    }

    const recapChat = form.closest("[data-recap-panel='chat']")?.querySelector(".recap-chat");
    if (recapChat) {
      recapChat.insertAdjacentHTML("beforeend", `<div class="chat-message user"><p>${escapeHTML(text)}</p></div>`);
    }
    input.value = "";
    showToast("已加入本次复盘对话。");
  });
});

renderCalendar();
renderSubjectWorkspace();
