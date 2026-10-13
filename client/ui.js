export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node;
}
export function button(text, action, className = 'r1-button') {
  const node = el('button', className, text); node.type = 'button';
  node.addEventListener('click', () => perform(node, action)); return node;
}
export function link(text, href) { const node=el('a','r1-button',text); node.href=href; return node; }
export function note(text) { return el('p','local-note',text); }
export function empty(text) { return el('p','empty-state',text); }
export function field(label, {name, type = 'text', value = '', required = false, rows, placeholder, maxLength} = {}) {
  const wrapper = el('label','form-field',label); const input=el(rows ? 'textarea' : 'input');
  input.name=name || ''; if (!rows) input.type=type; else input.rows=rows;
  input.value=value; input.required=required; if(placeholder)input.placeholder=placeholder; if(maxLength)input.maxLength=maxLength;
  wrapper.append(input); return wrapper;
}
export function selectField(label, name, options, value) {
  const wrapper=el('label','form-field',label); const select=el('select'); select.name=name;
  for(const [val, title] of options) {const option=el('option','',title); option.value=val; select.append(option);} if(value!=null)select.value=value;
  wrapper.append(select); return wrapper;
}
export function form(fields, submitText, submit) {
  const node=el('form','stack-form'); node.append(...fields); const status=el('p','form-error'); status.setAttribute('role','alert');
  const send=el('button','r1-button primary',submitText); send.type='submit'; node.append(status,send);
  node.addEventListener('submit',async event=>{event.preventDefault(); status.textContent='';
    if(send.disabled)return;send.textContent='正在处理…';
    try{await perform(send,()=>submit(new FormData(node),node),error=>{if(error.status===401)reportError(error);else status.textContent=error.message;});}finally{send.textContent=submitText;}}); return node;
}
export async function perform(trigger, action, onError = reportError) {
  if(trigger?.disabled)return; if(trigger)trigger.disabled=true;
  try {return await action();} catch(error) {if(error.name!=='AbortError')onError(error);} finally {if(trigger?.isConnected)trigger.disabled=false;}
}
let errorHandler = error => console.error(error);
export function setErrorHandler(handler) {errorHandler=handler;}
export function reportError(error) {errorHandler(error);}
export function modal(title, content) { $('[data-modal-title]').textContent=title; $('[data-modal-content]').replaceChildren(content); const dialog=$('[data-modal]'); if(!dialog.open)dialog.showModal(); return dialog; }
export const closeModal = () => $('[data-modal]').close();
export function formatDate(value) {if(!value)return ''; const date=new Date(value);return Number.isNaN(date.valueOf())?'':date.toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
export function bytes(size) {return size<1024?`${size} B`:size<1048576?`${Math.round(size/1024)} KB`:`${(size/1048576).toFixed(1)} MB`;}
export function show(selector, visible) {const node=$(selector); if(node)node.hidden=!visible;}
