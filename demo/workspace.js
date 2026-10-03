import { createProductDemoDataSource } from './data-source.js';
import { recapFixture } from './scenario.js';

// Demo-only domain orchestration. The real-local app never imports this module.
export function createProductDemo() {
  const dataSource = createProductDemoDataSource();
  const reviews = new Map();
  const references = new Map();
  let context, ui, session = null, screen = 'home', showInactive = false;
  let stateEdit = null, resourceId = null, renderedReviewKey = null;
  const $ = selector => document.querySelector(selector);
  const el = (tag, className, content) => context.node(tag, className, content);
  const button = (label, action, value = '') => {
    const result = el('button', 'text-link', label);
    result.type = 'button'; result.dataset.demoAction = action;
    if (value) result.dataset.value = value;
    return result;
  };
  function heading(target, title, note) {
    target.append(el('h2', '', title));
    if (note) target.append(el('p', 'local-note', note));
  }
  function validSource(id, subjectId = ui.subject?.id) {
    return dataSource.list(subjectId).find(chat => chat.id === id && chat.kind === 'learning');
  }
  function sources(target, ids, subjectId, open = true) {
    for (const id of ids) {
      const chat = validSource(id, subjectId);
      if (!chat) { target.append(el('span', 'local-note', '原对话已不可用')); continue; }
      if (open) {
        const link = button(chat.title, 'open-source', id);
        link.setAttribute('aria-label', `打开原对话：${chat.title}`);
        target.append(link);
      } else target.append(el('span', '', chat.title));
    }
  }
  function beginReview(ids) {
    session = { subjectId: ui.subject.id, sourceIds: ids.filter(id => validSource(id)), focus: '', draft: '', conversationId: null, candidates: [], revealed: false };
    screen = 'setup'; ui.tab = 'review'; context.render();
  }
  function renderReview() {
    const panel = $('[data-subject-panel="review"]');
    const key = `${ui.subject.id}:${screen}:${session?.conversationId ?? ''}`;
    panel.replaceChildren();
    if (key !== renderedReviewKey) panel.scrollTop = 0;
    renderedReviewKey = key;
    const body = el('div', 'demo-task');
    panel.append(body);
    body.dataset.demoReviewScreen = screen;
    if (screen === 'home') {
      heading(body, '回顾', '把值得继续想的问题留在这里，需要时再回到原对话。');
      const recent = el('section', 'demo-section');
      heading(recent, '最近学习');
      sources(recent, dataSource.list(ui.subject.id).filter(c => c.kind === 'learning').slice(0, 3).map(c => c.id), ui.subject.id);
      body.append(recent);
      const start = button('开始一次回顾', 'general-review'); start.classList.add('r1-button'); body.append(start);
      const memory = el('section', 'demo-section');
      heading(memory, '值得继续关注');
      const active = el('div'); active.dataset.demoMemoryActive = '';
      renderMemory(active, true); memory.append(active);
      memory.append(button(showInactive ? '收起以往记录' : '查看以往记录', 'inactive'));
      if (showInactive) {
        const inactive = el('div', 'demo-past-memory'); inactive.dataset.demoMemoryInactive = '';
        heading(inactive, '以往记录'); renderMemory(inactive, false); memory.append(inactive);
      }
      body.append(memory);
      return;
    }
    if (screen === 'setup') {
      heading(body, '本次回顾');
      const label = el('label', 'demo-label', '你想重点回顾什么？'); label.htmlFor = 'demo-focus';
      const input = el('textarea', 'demo-input'); input.id = 'demo-focus'; input.rows = 2; input.value = session.focus;
      input.dataset.demoFocus = ''; input.placeholder = '例如：循环删除时，iterator 应该怎样更新？';
      body.append(label, input);
      const refs = el('section', 'demo-section'); heading(refs, '参考学习记录');
      const selected = el('div', 'demo-source-list'); selected.dataset.demoSetupSources = '';
      if (!session.sourceIds.length) selected.append(el('p', 'local-note', '尚未选择学习记录'));
      sources(selected, session.sourceIds, session.subjectId, false);
      refs.append(selected, button('添加其他对话', 'select-sources')); body.append(refs);
      const actions = el('div', 'demo-actions');
      const start = button('开始回顾', 'start-review'); start.classList.add('r1-button');
      actions.append(start, button('返回回顾首页', 'review-home')); body.append(actions);
      return;
    }
    heading(body, '本次回顾');
    const refs = el('div', 'demo-source-summary'); refs.dataset.demoReviewSources = '';
    refs.append(el('span', 'local-note', '本次参考'));
    sources(refs, session.sourceIds, session.subjectId);
    if (!session.sourceIds.length) refs.append(el('span', 'local-note', '未选择学习记录'));
    refs.append(button('调整参考', 'select-sources')); body.append(refs);
    const originalSources = dataSource.messages(session.conversationId).find(m => m.role === 'assistant')?.referenceConversationIds ?? [];
    if (originalSources.length !== session.sourceIds.length || originalSources.some(id => !session.sourceIds.includes(id))) {
      const provenance = el('div', 'demo-fixture-provenance'); provenance.dataset.demoFixtureProvenance = '';
      provenance.append(el('p', 'local-note', '示例内容基于开始回顾时的记录；调整参考不会重新生成内容。'));
      sources(provenance, originalSources, session.subjectId);
      body.append(provenance);
    }
    const messages = el('div', 'demo-review-messages'); messages.dataset.demoReviewMessages = '';
    for (const message of dataSource.messages(session.conversationId)) messages.append(el('article', message.role === 'assistant' ? 'r1-assistant-message' : 'r1-user-message', message.content));
    body.append(messages);
    const form = el('form', 'r1-composer demo-review-composer'); form.dataset.demoReviewForm = '';
    const label = el('label', 'sr-only', '回顾输入'); label.htmlFor = 'demo-review-input';
    const input = el('textarea'); input.id = label.htmlFor; input.rows = 2; input.placeholder = '继续写下你的回顾…'; input.value = session.draft; input.dataset.demoReviewInput = '';
    input.disabled = context.isSaving();
    const send = el('button', 'r1-button', context.isSaving() ? '保存中…' : '发送'); send.type = 'submit'; send.setAttribute('aria-label', '发送回顾消息'); send.disabled = input.disabled;
    form.append(label, input, send); body.append(form, el('p', 'local-note', '本页演示输入不会生成新的 AI 回答。'));

    body.append(button('看看可能值得留下的内容', 'reveal-candidates'));
    if (session.revealed) {
      const candidates = el('section', 'demo-section'); heading(candidates, '这次可能值得留下');
      if (!session.candidates.some(c => !c.decision)) candidates.append(el('p', 'local-note', '没有待确认的候选。可以不留下任何内容。'));
      for (const candidate of session.candidates.filter(c => !c.decision)) renderCandidate(candidates, candidate);
      body.append(candidates);
    }
    body.append(button('返回回顾首页', 'review-home'));
  }
  function renderMemory(target, active) {
    const items = dataSource.memory.filter(m => m.subjectId === ui.subject.id && m.active === active);
    if (!items.length) target.append(el('p', 'local-note', active ? '暂时没有需要继续关注的学习点。' : '暂时没有以往记录。'));
    for (const item of items) {
      const article = el('article', 'demo-memory'); article.dataset.demoMemoryId = item.id;
      article.append(el('h3', '', item.title), el('p', '', item.content));
      sources(article, item.sourceIds, item.subjectId); target.append(article);
    }
  }
  function renderCandidate(target, candidate) {
    const article = el('article', 'demo-candidate'); article.dataset.demoCandidateId = candidate.id;
    article.append(el('h3', '', candidate.title));
    if (candidate.editing) {
      const label = el('label', 'sr-only', '候选内容'); label.htmlFor = `candidate-${candidate.id}`;
      const input = el('textarea', 'demo-input'); input.id = label.htmlFor; input.value = candidate.draft; input.rows = 3;
      input.dataset.demoCandidateInput = candidate.id;
      article.append(label, input, button('完成编辑', 'finish-edit', candidate.id));
    } else article.append(el('p', '', candidate.content));
    if (candidate.error) article.append(el('p', 'r1-error', candidate.error));
    const evidence = el('details', 'demo-evidence'); evidence.append(el('summary', '', '查看依据与原对话'), el('p', 'local-note', candidate.evidence));
    sources(evidence, candidate.sourceIds, session.subjectId); article.append(evidence);
    const actions = el('div', 'demo-actions');
    actions.append(button('编辑', 'edit-candidate', candidate.id), button('忽略', 'ignore', candidate.id), button('保留', 'keep', candidate.id));
    article.append(actions); target.append(article);
  }
  function renderSourcesDialog() {
    const dialog = $('[data-demo-source-dialog]'); dialog.replaceChildren();
    heading(dialog, '选择学习记录', '勾选用于本次回顾；打开原对话是另一个操作。');
    for (const chat of dataSource.list(session.subjectId).filter(c => c.kind === 'learning')) {
      const label = el('label', 'demo-selection-row');
      const input = el('input'); input.type = 'checkbox'; input.dataset.demoSelectSource = chat.id;
      input.checked = session.sourceIds.includes(chat.id);
      label.append(input, el('span', '', chat.title)); dialog.append(label);
    }
    dialog.append(button('完成选择', 'close-source'));
  }
  function renderReference() {
    const target = $('[data-learning-reference]'); target.replaceChildren();
    const resource = dataSource.resources.find(r => r.id === references.get(ui.conversation?.id) && r.subjectId === ui.subject?.id);
    target.hidden = !resource;
    if (resource) target.append(el('span', 'local-note', '本次参考'), el('span', '', resource.name), button('移除', 'remove-reference'));
  }
  function renderFiles() {
    const panel = $('[data-subject-panel="files"]'); panel.replaceChildren();
    const body = el('div', 'demo-task'); heading(body, '私人资料', '查看资料不会自动将它用于当前学习。');
    const resources = dataSource.resources.filter(r => r.subjectId === ui.subject.id);
    if (!resources.length) body.append(el('p', 'local-note', '当前学科还没有私人资料。'));
    for (const resource of resources) {
      const row = button('', 'open-resource', resource.id); row.classList.add('demo-file-row');
      row.setAttribute('aria-label', resource.name);
      row.append(el('span', 'demo-file-name', resource.name), el('span', 'demo-file-meta', 'PDF · 私人资料'));
      body.append(row);
    }
    panel.append(body);
  }
  function openResource(id) {
    const resource = dataSource.resources.find(r => r.id === id && r.subjectId === ui.subject.id);
    if (!resource) return;
    resourceId = id;
    const dialog = $('[data-demo-resource-dialog]'); dialog.replaceChildren();
    heading(dialog, resource.name, '示例文档节选 · 仅用于交互演示');
    dialog.append(el('p', 'demo-full-text', resource.preview));
    dialog.append(el('p', 'local-note', ui.conversation ? `用于：${ui.conversation.title}` : '先选择或新建一段对话，再作为学习参考。'));
    const use = button('用于当前学习', 'use-resource'); use.disabled = !ui.conversation || ui.conversation.kind === 'review';
    const actions = el('div', 'demo-actions'); actions.append(use, button('关闭', 'close-resource')); dialog.append(actions); dialog.showModal();
  }
  function renderState() {
    const dialog = $('[data-demo-state-dialog]'); dialog.replaceChildren();
    heading(dialog, `${ui.subject.name} · 现状`);
    const current = el('p', 'demo-full-text', dataSource.states[ui.subject.id]); current.dataset.demoStateCurrent = '';
    dialog.append(el('h3', '', '当前完整现状'), current);
    if (stateEdit) {
      if (stateEdit.preview) {
        dialog.append(el('h3', '', '将采用的完整现状'));
        const proposed = el('p', 'demo-full-text', stateEdit.text); proposed.dataset.demoStateProposed = '';
        dialog.append(proposed, button('返回编辑', 'state-edit-back'), button('采用', 'state-adopt'));
      } else {
        const label = el('label', 'demo-label', '拟采用的完整现状'); label.htmlFor = 'demo-state-edit';
        const input = el('textarea', 'demo-input'); input.id = label.htmlFor; input.rows = 7; input.value = stateEdit.text; input.dataset.demoStateInput = '';
        dialog.append(label, input, button('预览完整现状', 'state-preview'));
      }
      dialog.append(button('取消编辑', 'state-cancel'));
    } else dialog.append(button('编辑／补充', 'state-edit'));
    dialog.append(button('关闭', 'state-close'));
  }
  return {
    dataSource,
    mount(value) {
      context = value;
      const reference = el('div', 'r1-learning-reference'); reference.dataset.learningReference = ''; reference.hidden = true;
      $('[data-messages]').before(reference);
      $('[data-subject-index] .local-note').textContent = '演示学科与对话仅在本页会话中变化；刷新会恢复示例。';
      const marker = $('.dev-principal'); marker.textContent = '产品演示'; marker.dataset.productDemoMarker = '';
      for (const name of ['source', 'resource', 'state']) {
        const dialog = el('dialog', `demo-${name}-dialog`); dialog.dataset[`demo${name[0].toUpperCase() + name.slice(1)}Dialog`] = '';
        dialog.setAttribute('aria-label', { source: '选择学习记录', resource: '私人资料', state: '当前学科现状' }[name]);
        document.body.append(dialog);
      }
      document.addEventListener('input', event => {
        if (event.target.matches('[data-demo-review-input]') && session) session.draft = event.target.value;
        if (event.target.matches('[data-demo-focus]') && session) session.focus = event.target.value;
        if (event.target.matches('[data-demo-state-input]') && stateEdit) stateEdit.text = event.target.value;
        if (event.target.matches('[data-demo-candidate-input]') && session) {
          const candidate = session.candidates.find(c => c.id === event.target.dataset.demoCandidateInput);
          if (candidate) candidate.draft = event.target.value;
        }
      });
      document.addEventListener('submit', async event => {
        if (!event.target.matches('[data-demo-review-form]')) return;
        event.preventDefault();
        if (!session || session.subjectId !== ui.subject.id || session.conversationId !== ui.conversation?.id || context.isSaving()) return;
        const activeSession = session;
        const content = activeSession.draft;
        if (await context.sendMessage(content)) {
          activeSession.draft = '';
          if (session === activeSession) renderReview();
        }
      });
      document.addEventListener('change', event => {
        const id = event.target.dataset.demoSelectSource;
        if (!id || !session || session.subjectId !== ui.subject.id || !validSource(id, session.subjectId)) return;
        session.sourceIds = event.target.checked ? [...new Set([...session.sourceIds, id])] : session.sourceIds.filter(value => value !== id);
        renderReview();
      });
    },
    closeDialogs() {
      for (const name of ['source', 'resource', 'state']) $(`[data-demo-${name}-dialog]`).close();
      stateEdit = null;
    },
    conversationLoaded(value) {
      if (value.conversation.kind === 'review') {
        session = reviews.get(value.conversation.id) ?? null;
        if (session?.subjectId === value.subject.id) { screen = 'chat'; value.tab = 'review'; }
      }
    },
    tabChanged(tab) { if (tab === 'review') screen = 'home'; },
    render(value) {
      ui = value;
      if (!ui.subject) {
        $('[data-learning-reference]').hidden = true;
        $('[data-review-current]').hidden = true;
        for (const tab of ['review', 'files']) $(`[data-subject-panel="${tab}"]`).replaceChildren(el('p', 'local-note', '正在读取学科…'));
        return;
      }
      if (session && session.subjectId !== ui.subject.id) { session = null; screen = 'home'; showInactive = false; }
      $('[data-review-current]').hidden = !ui.conversation || ui.conversation.kind === 'review';
      $('[data-model-status]').textContent = '演示对话仅在本页会话中变化；新增输入不会生成 AI 回答。';
      renderReference(); renderReview(); renderFiles();
    },
    handleClick(target, value) {
      ui = value;
      if (target.matches('[data-review-current]')) { if (ui.subject && ui.conversation) beginReview([ui.conversation.id]); return true; }
      if (target.matches('[data-future-state]') && ui.subject && $('#subjects-view').classList.contains('active')) {
        stateEdit = null; renderState(); $('[data-demo-state-dialog]').showModal(); return true;
      }
      const action = target.dataset.demoAction;
      if (!action) return false;
      const id = target.dataset.value;
      const candidate = session?.candidates.find(c => c.id === id && !c.decision);
      switch (action) {
        case 'general-review': beginReview([]); break;
        case 'review-home': screen = 'home'; context.render(); break;
        case 'inactive': showInactive = !showInactive; renderReview(); break;
        case 'select-sources':
          if (session?.subjectId !== ui.subject.id) break;
          renderSourcesDialog(); $('[data-demo-source-dialog]').showModal(); break;
        case 'close-source': $('[data-demo-source-dialog]').close(); break;
        case 'open-source':
          if (validSource(id)) context.openConversation(id); break;
        case 'start-review': {
          if (session?.subjectId !== ui.subject.id) break;
          session.sourceIds = session.sourceIds.filter(id => validSource(id));
          const fixture = recapFixture(session.sourceIds);
          const chat = dataSource.createReview(ui.subject.id, session.focus, fixture.assistant, session.sourceIds);
          session.conversationId = chat.id; session.candidates = fixture.candidates;
          reviews.set(chat.id, session); screen = 'chat'; context.activateReview(chat); break;
        }
        case 'reveal-candidates': session.revealed = true; renderReview(); break;
        case 'edit-candidate': if (candidate) { candidate.editing = true; candidate.draft = candidate.content; renderReview(); } break;
        case 'finish-edit': if (candidate?.draft.trim()) { candidate.content = candidate.draft.trim(); candidate.editing = false; renderReview(); } break;
        case 'ignore': if (candidate) { candidate.decision = 'ignored'; renderReview(); } break;
        case 'keep': {
          if (!candidate || session.subjectId !== ui.subject.id) break;
          if (candidate.editing) {
            if (!candidate.draft.trim()) { candidate.error = '候选内容不能为空。'; renderReview(); break; }
            candidate.content = candidate.draft.trim(); candidate.editing = false;
          }
          const existing = dataSource.memory.find(m => m.id === id && m.subjectId === session.subjectId);
          const fields = { id, subjectId: session.subjectId, title: candidate.title, content: candidate.content, sourceIds: [...candidate.sourceIds], reviewConversationId: session.conversationId, active: candidate.active };
          if (existing) Object.assign(existing, fields); else dataSource.memory.push(fields);
          candidate.decision = 'kept'; renderReview(); break;
        }
        case 'open-resource': openResource(id); break;
        case 'close-resource': $('[data-demo-resource-dialog]').close(); break;
        case 'use-resource':
          if (!ui.conversation || ui.conversation.kind === 'review' || !dataSource.resources.some(r => r.id === resourceId && r.subjectId === ui.subject.id)) break;
          references.set(ui.conversation.id, resourceId); $('[data-demo-resource-dialog]').close(); ui.tab = 'learn'; context.render(); break;
        case 'remove-reference': references.delete(ui.conversation.id); renderReference(); break;
        case 'state-edit': stateEdit = { text: dataSource.states[ui.subject.id], preview: false }; renderState(); break;
        case 'state-edit-back': stateEdit.preview = false; renderState(); break;
        case 'state-preview': if (stateEdit.text.trim()) { stateEdit.preview = true; renderState(); } break;
        case 'state-cancel': stateEdit = null; renderState(); break;
        case 'state-adopt': if (stateEdit?.preview) { dataSource.states[ui.subject.id] = stateEdit.text; stateEdit = null; renderState(); } break;
        case 'state-close': stateEdit = null; $('[data-demo-state-dialog]').close(); break;
      }
      return true;
    },
  };
}
