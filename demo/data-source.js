import { scenario, demoNow } from './scenario.js';

export function createProductDemoDataSource() {
  const data = structuredClone(scenario);
  let sequence = 0;
  const requests = new Map();
  for (const conversation of data.conversations) {
    conversation.created_at = conversation.updated_at;
    data.messages[conversation.id] = data.messages[conversation.id].map(([role, content], ordinal) => ({
      id: `${conversation.id}-m${ordinal}`, conversation_id: conversation.id, role, content,
      ordinal, created_at: conversation.updated_at, origin: 'DEMO_FIXTURE',
    }));
  }
  const copy = value => structuredClone(value);
  function subject(id) {
    const value = data.subjects.find(s => s.id === id);
    if (!value) throw new Error('SUBJECT_NOT_FOUND：演示学科不存在');
    return value;
  }
  function conversation(id) {
    const value = data.conversations.find(c => c.id === id && !c.deleted_at);
    if (!value) throw new Error('CONVERSATION_NOT_FOUND：演示对话不存在或已删除');
    subject(value.subject_space_id);
    return value;
  }
  function createConversation(subjectId, title = '新对话', kind = 'learning') {
    subject(subjectId);
    const value = { id: `demo-chat-${++sequence}`, subject_space_id: subjectId, title, kind, created_at: demoNow, updated_at: demoNow };
    data.conversations.unshift(value);
    data.messages[value.id] = [];
    return copy(value);
  }
  function append(id, role, content, origin, sourceIds) {
    const chat = conversation(id);
    const list = data.messages[id];
    const message = { id: `demo-message-${++sequence}`, conversation_id: id, role, content, ordinal: list.length, created_at: demoNow, origin };
    if (sourceIds) message.referenceConversationIds = [...sourceIds];
    list.push(message); chat.updated_at = demoNow;
    return copy(message);
  }
  return {
    now: demoNow,
    resources: data.resources,
    states: data.states,
    memory: data.memory,
    list: subjectId => copy(data.conversations.filter(c => c.subject_space_id === subjectId && !c.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
    messages: id => { conversation(id); return copy(data.messages[id]); },
    conversation: id => copy(conversation(id)),
    createReview(subjectId, focus, assistant, sourceIds) {
      const chat = createConversation(subjectId, '本次回顾', 'review');
      if (focus.trim()) append(chat.id, 'user', focus.trim(), 'DEMO_USER_INPUT');
      append(chat.id, 'assistant', assistant, 'DEMO_FIXTURE', sourceIds);
      return copy(chat);
    },
    async request(path, { method = 'GET', body } = {}) {
      const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[1] === 'subjects' && parts.length === 2) {
        if (method === 'GET') return { subjects: copy(data.subjects) };
        if (method === 'POST' && body?.name?.trim()) {
          const value = { id: `demo-subject-${++sequence}`, name: body.name.trim() };
          data.subjects.push(value); data.states[value.id] = '尚未整理当前学科的学习现状。';
          return { subject: copy(value) };
        }
      }
      if (parts[1] === 'subjects' && parts[3] === 'conversations' && parts.length === 4) {
        subject(parts[2]);
        if (method === 'GET') return { conversations: this.list(parts[2]) };
        if (method === 'POST') return { conversation: createConversation(parts[2]) };
      }
      if (parts[1] === 'conversations') {
        const chat = conversation(parts[2]);
        if (parts.length === 3 && method === 'GET') return { conversation: copy(chat) };
        if (parts.length === 3 && method === 'DELETE') { chat.deleted_at = demoNow; return null; }
        if (parts[3] === 'messages' && method === 'GET') return { messages: copy(data.messages[chat.id]) };
        if (parts[3] === 'messages' && method === 'POST') {
          if (body?.role && body.role !== 'user') throw new Error('INVALID_ROLE：演示普通输入只能写用户消息');
          if (!body?.content?.trim() || !body?.requestId) throw new Error('INVALID_INPUT：消息与请求 ID 必须有效');
          const key = `${chat.id}:${body.requestId}`;
          if (requests.has(key)) return { message: copy(requests.get(key)), replayed: true };
          const message = append(chat.id, 'user', body.content.trim(), 'DEMO_USER_INPUT');
          requests.set(key, message);
          return { message };
        }
      }
      throw new Error('DEMO_ROUTE_NOT_FOUND：没有这项演示操作');
    },
  };
}
