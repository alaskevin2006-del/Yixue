const timelineShell = document.querySelector('[data-timeline-shell]');
const dateStrip = document.querySelector('[data-date-strip]');
const today = new Date(2026, 8, 28);
const calendarState = {
  selectedDate: new Date(today),
  mode: "day",
  candidateVisible: false,
  candidateAccepted: false,
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
  { key: 'code', label: '代码', symbol: '⌘' },
  { key: 'math', label: '数学', symbol: '∑' },
  { key: 'book', label: '书本', symbol: '📖' },
  { key: 'folder', label: '文件夹', symbol: '📁' },
  { key: 'science', label: '科学', symbol: '⚛' },
  { key: 'tree', label: '结构', symbol: '🌳' },
];
function subjectIconKey(subject) {
  return subjectIcons.get(subject.id) ?? (/c\+\+|编程/i.test(subject.name) ? 'code' : /数学|概率/.test(subject.name) ? 'math' : /结构/.test(subject.name) ? 'tree' : 'folder');
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
}
function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
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
    const icon = node('span', `r1-subject-icon icon-${preset.key}`, preset.symbol);
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
  const visible = mobile.matches ? ui.mobileOpen : !ui.desktopCollapsed;
  hide('[data-conversation-nav]', !visible);
  hide('[data-nav-scrim]', !mobile.matches || !ui.mobileOpen);
  $('.r1-learning').classList.toggle('nav-collapsed', !visible);
  const toggle = $('[data-nav-toggle]');
  toggle.setAttribute('aria-expanded', String(visible));
  toggle.setAttribute('aria-label', visible ? '收起对话导航' : '展开对话导航');
  toggle.textContent = '☰ 对话';
  hide('[data-nav-close]', !mobile.matches);
}
function renderConversationList() {
  const list = $('[data-conversation-list]');
  list.replaceChildren();
  hide('[data-conversation-loading]', !ui.loadingConversations);
  $('[data-new-conversation]').disabled = !ui.subject || ui.loadingConversations || ui.creating;
  $('[data-new-conversation]').textContent = ui.creating ? '正在创建…' : '+ 新对话';
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
  text('[data-message-target]', ui.conversation ? `${ui.subject.name} · 当前对话：${ui.conversation.title}` : '尚未选择对话');
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
  if (button.matches('[data-view-link]')) { event.preventDefault(); setRoute(button.dataset.viewLink); }
  else if (button.matches('[data-subject-id]')) setRoute(conversationRoute(button.dataset.subjectId));
  else if (button.matches('[data-conversation-id]')) { if (ui.subject) setRoute(conversationRoute(ui.subject.id, button.dataset.conversationId)); }
  else if (button.matches('[data-subject-home]')) setRoute('subjects');
  else if (button.matches('[data-new-conversation]')) createConversation();
  else if (button.matches('[data-delete-conversation]')) deleteConversation();
  else if (button.matches('[data-subject-tab]')) { ui.tab = button.dataset.subjectTab; ui.mobileOpen = false; productDemo?.tabChanged(ui.tab, ui); renderWorkspace(); }
  else if (button.matches('[data-nav-toggle]')) { if (mobile.matches) ui.mobileOpen = !ui.mobileOpen; else ui.desktopCollapsed = !ui.desktopCollapsed; renderNavigation(); }
  else if (button.matches('[data-nav-close], [data-nav-scrim]')) { ui.mobileOpen = false; renderNavigation(); $('[data-nav-toggle]').focus(); }
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
  else if (button.matches('[data-future-state]')) $('[data-future-dialog]').showModal();
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
document.addEventListener('keydown', event => { if (event.key === 'Escape' && ui.mobileOpen) { ui.mobileOpen = false; renderNavigation(); $('[data-nav-toggle]').focus(); } });
productDemo?.mount({
  node, render: renderWorkspace, sendMessage: sendCurrentMessage, isSaving: () => saving.has(ui.conversation?.id),
  openConversation: id => setRoute(conversationRoute(ui.subject.id, id)),
  activateReview(chat) {
    ++navigationVersion;
    ui.conversation = chat; ui.messages = dataSource.messages(chat.id);
    ui.conversations = dataSource.list(ui.subject.id); ui.tab = 'review'; ui.mobileOpen = false;
    setRoute(conversationRoute(ui.subject.id, chat.id), true); renderWorkspace();
  },
});
if (productDemo && !location.hash) setRoute('subjects/demo-cpp/conversations/cpp-erase', true);
route();
