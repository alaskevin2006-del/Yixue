import { api } from "./client";
import { fileAccessUrl } from "./fileLinks";
import type { UploadPlan } from "./types";

function transfer(
  plan: UploadPlan,
  file: File,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const request = new XMLHttpRequest();
    request.open(plan.method, fileAccessUrl(plan.url));
    request.timeout = 180_000;
    for (const [name, value] of Object.entries(plan.headers))
      request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total)
        onProgress(Math.round((100 * event.loaded) / event.total));
    };
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    request.onloadend = () => signal.removeEventListener("abort", abort);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("附件传输失败，请重试。"));
    };
    request.onerror = () => reject(new Error("附件传输中断，请重试。"));
    request.ontimeout = () => reject(new Error("附件传输超时，请重试。"));
    request.onabort = () =>
      reject(signal.reason ?? new DOMException("上传已取消", "AbortError"));
    if (plan.method === "PUT") request.send(file);
    else {
      const fields = new FormData();
      for (const [name, value] of Object.entries(plan.form_fields ?? {}))
        fields.append(name, value);
      fields.append("file", file);
      request.send(fields);
    }
  });
}

function pauseBeforeCheck(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 2000);
    const abort = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function uploadAttachment(
  file: File,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
  onCheck: () => void,
) {
  const plan = await api.planUpload({
    filename: file.name,
    size_bytes: file.size,
    content_type: file.type || "application/octet-stream",
  });
  try {
    await transfer(plan, file, signal, onProgress);
    signal.throwIfAborted();
    onCheck();
    let state = await api.finishUpload(plan.upload_id);
    for (
      let attempt = 0;
      state.status === "checking" && attempt < 25;
      attempt++
    ) {
      await pauseBeforeCheck(signal);
      state = await api.uploadState(plan.upload_id, signal);
    }
    signal.throwIfAborted();
    if (state.status !== "ready" || !state.file_id)
      throw new Error(state.reason || "未能确认附件检查结果，请重试。");
    return { fileId: state.file_id, uploadId: plan.upload_id };
  } catch (error) {
    void api.cancelUpload(plan.upload_id).catch(() => undefined);
    throw error;
  }
}
