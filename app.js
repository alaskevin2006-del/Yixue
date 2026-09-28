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
  },
  math: {
    name: "高等数学",
    state: "高等数学最近在复习极限与连续，适合用少量典型题确认定义与图像理解是否稳定。",
    current: "高等数学最近在复习极限与连续。",
    candidate: "下一步用典型题确认极限与连续的判定是否稳定。",
  },
  probability: {
    name: "概率论",
    state: "概率论暂时没有新的现状补充，可以在下次学习前先说明当前卡点。",
    current: "概率论暂时没有新的现状补充。",
    candidate: "下次学习前先补充当前章节和卡点。",
  },
  ds: {
    name: "数据结构",
    state: "数据结构当前适合围绕树和图的基础操作做一次小范围回顾。",
    current: "数据结构当前适合围绕树和图的基础操作回顾。",
    candidate: "先回顾树和图的基础操作，再决定是否刷题。",
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
  "private-stl": { title: "STL 容器与迭代器.pdf", meta: "私人资料 · PDF · 2024", copy: "这是当前学科内保存的私人资料。" },
  "private-final": { title: "C++ 期末复习题.pdf", meta: "私人资料 · PDF", copy: "可在当前学习中作为参考资料使用。" },
};

const submissions = {
  "cpp-review": { title: "C++ 复习资料.pdf", meta: "投稿资料", copy: "当前状态：审核中。审核通过后会作为独立公共资料收录。" },
  "math-final": { title: "高数 2025 期末试卷.pdf", meta: "投稿资料", copy: "当前状态：已收录。收录后已生成独立公共资料。" },
};

const conversations = {
  erase: [
    ["user", "erase 不是返回一个元素吗，为什么会和 iterator 失效有关？"],
    ["ai", "这里先区分两件事：erase 的返回值可继续使用，但被删除位置之后原有的 iterator 可能已经失效。"],
  ],
  insert: [
    ["user", "insert 到底返回什么？"],
    ["ai", "多数 STL 容器的 insert 会返回指向新插入元素的 iterator，但是否导致其他 iterator 失效，要看具体容器和插入位置。"],
  ],
  virtual: [
    ["user", "虚析构为什么需要 virtual？"],
    ["ai", "当你通过基类指针删除派生类对象时，virtual 析构能保证派生类析构逻辑也被执行。"],
  ],
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

function showSubjectPanel(name) {
  document.querySelectorAll("[data-subject-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.subjectPanel === name);
  });
  const tabName = name === "recap" ? "review" : name;
  document.querySelectorAll("[data-subject-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.subjectTab === tabName);
  });
  subjectTitle.textContent = name === "spaces" ? "学科空间" : subjects[currentSubject].name;
  subjectSubnav.classList.toggle("compact-state", name === "spaces");
}

function openSubject(subjectKey) {
  currentSubject = subjectKey;
  currentStateSubject = subjectKey;
  showSubjectPanel("learn");
  if (subjectKey === "cpp") {
    loadConversation("erase", false);
    return;
  }
  chatSurface.innerHTML = `<div class="chat-message ai"><p>可以直接开始一个关于 ${subjects[currentSubject].name} 的新问题。</p></div>`;
}

function showRecapStep(name) {
  showSubjectPanel("recap");
  document.querySelectorAll("[data-recap-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.recapPanel === name);
  });
}

function updateStateDetail(subjectKey) {
  currentStateSubject = subjectKey;
  const subject = subjects[subjectKey] ?? subjects.cpp;
  document.querySelector("[data-state-title]").textContent = subject.name;
  document.querySelector("[data-state-copy]").textContent = subject.state;
  document.querySelector("[data-state-edit-title]").textContent = `${subject.name} · 现状更新`;
  document.querySelector("[data-state-current]").textContent = subject.current;
  document.querySelector("[data-state-candidate]").textContent = subject.candidate;
  document.querySelector("[data-state-textarea]").value = subject.candidate;
}

function showStatePanel(name) {
  document.querySelectorAll("[data-state-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.statePanel === name);
  });
}

function openDrawer(name, scope) {
  document.querySelectorAll("[data-drawer]").forEach((drawer) => {
    drawer.classList.toggle("active", drawer.dataset.drawer === name);
  });
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

function loadConversation(id, switchToLearn = true) {
  const messages = conversations[id] ?? conversations.erase;
  chatSurface.innerHTML = messages.map(([role, text]) => `<div class="chat-message ${role}"><p>${text}</p></div>`).join("");
  if (switchToLearn) {
    showView("subjects");
    showSubjectPanel("learn");
  }
  closeDrawer();
}

function startNewChat() {
  chatSurface.innerHTML = `<div class="chat-message ai"><p>可以直接开始一个新的问题。当前学科是 ${subjects[currentSubject].name}。</p></div>`;
  showToast("已开始新的空白对话。");
}

function applyMemoryAction(button) {
  const action = button.dataset.memoryAction;
  const article = button.closest("article");
  if (!article) return;
  if (action === "ignore") {
    article.classList.add("hidden");
    showToast("已忽略这条候选记忆点。");
    return;
  }
  if (action === "keep") {
    article.classList.add("kept");
    button.textContent = "已保留";
    button.disabled = true;
    showToast("已保留这条记忆点。");
    return;
  }
  const paragraph = article.querySelector("p");
  const existing = article.querySelector("textarea");
  if (existing) {
    const nextParagraph = document.createElement("p");
    nextParagraph.textContent = existing.value;
    existing.replaceWith(nextParagraph);
    button.textContent = "编辑";
    return;
  }
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
  const list = document.querySelector("[data-private-resources]");
  if (!list || !files.length) return;
  Array.from(files).forEach((file, index) => {
    const id = `uploaded-private-${Date.now()}-${index}`;
    const safeName = escapeHTML(file.name);
    privateFiles[id] = {
      title: file.name,
      meta: `私人资料 · ${file.name.split(".").pop()?.toUpperCase() || "文件"}`,
      copy: "这是本次原型会话中临时加入的私人资料。",
    };
    list.insertAdjacentHTML(
      "afterbegin",
      `<div class="file-row">
        <span class="file-icon">FILE</span>
        <div><strong>${safeName}</strong><span>刚刚加入</span></div>
        <button class="more-btn" data-open-file="${id}">⋯</button>
      </div>`,
    );
  });
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
  };
  document.querySelector(".subject-grid")?.insertAdjacentHTML(
    "beforeend",
    `<button class="course-card" data-open-subject="${key}"><strong>${escapeHTML(cleanName)}</strong></button>`,
  );
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

document.querySelectorAll("[data-state-detail]").forEach((button) => {
  button.addEventListener("click", () => {
    updateStateDetail(button.dataset.stateDetail);
    showStatePanel("detail");
  });
});

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

document.querySelector("[data-new-chat]")?.addEventListener("click", startNewChat);

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
    if (input && input.value.trim()) input.value = "";
    showToast("已加入当前对话。");
  });
});

renderCalendar();
