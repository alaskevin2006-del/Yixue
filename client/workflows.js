import {ApiError, id} from './api.js';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function waitForRun(api, runId, {signal, sleep = pause, onProgress = () => {}} = {}) {
  for (;;) {
    signal?.throwIfAborted();
    const {run} = await api(`/api/runs/${id(runId)}`, {signal});
    onProgress(run);
    if (['succeeded','completed'].includes(run.status)) return run;
    if (['failed','cancelled'].includes(run.status)) {
      const error = new ApiError(run.error_message || 'AI 回答未完成，可以重试。', run.error_code, 502);
      error.run = run; throw error;
    }
    await sleep(1000);
  }
}
export function createMessageSender(api, makeId = () => crypto.randomUUID()) {
  const pending = new Map();
  const send = async (conversationId, content) => {
    const key = `${conversationId}\0${content}`;
    const requestId = pending.get(key) || makeId();
    pending.set(key, requestId);
    const result = await api(`/api/conversations/${id(conversationId)}/messages`, {method:'POST',body:{content,requestId}});
    pending.delete(key);
    return result;
  };
  send.reset = () => pending.clear();
  return send;
}
