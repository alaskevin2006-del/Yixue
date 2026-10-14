import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, lstatSync, existsSync, unlinkSync } from 'node:fs';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import Busboy from 'busboy';
import { HttpError } from './errors.js';

export const DEFAULT_LIMIT = 20 * 1024 * 1024;
export function storageRoot(config={}) { return path.resolve(config.uploadsDir || config.uploadDir || path.join(process.cwd(),'data','uploads')); }
export function initStorage(config) { mkdirSync(storageRoot(config),{recursive:true,mode:0o700}); }
export function safeFile(config,key,mustExist=true) {
  if (!/^[a-f0-9-]{36}\.blob$/.test(key || '')) throw new HttpError(500,'INVALID_STORAGE_PATH','资料存储路径异常');
  const root=realpathSync(storageRoot(config));const target=path.join(root,key);
  if (mustExist) {
    if (!existsSync(target)) throw new HttpError(404,'FILE_UNAVAILABLE','资料文件已不可用');
    if(lstatSync(target).isSymbolicLink() || path.dirname(realpathSync(target))!==root) throw new HttpError(500,'INVALID_STORAGE_PATH','资料存储路径异常');
  }
  return target;
}
export async function saveFile(config,bytes) { const key=`${randomUUID()}.blob`;await writeFile(safeFile(config,key,false),bytes,{flag:'wx',mode:0o600});return key; }
export async function copyStoredFile(config,key) { return saveFile(config,await readFile(safeFile(config,key))); }
export async function removeFile(config,key) { try { await unlink(safeFile(config,key)); } catch(e) { if(e.code!=='ENOENT' && e.code!=='FILE_UNAVAILABLE') throw e; } }
export function removeFileSync(config,key) { try {unlinkSync(safeFile(config,key));}catch(e){if(e.code!=='ENOENT'&&e.code!=='FILE_UNAVAILABLE')throw e;} }

const textExtensions=new Set(['.txt','.md','.markdown','.js','.mjs','.cjs','.ts','.tsx','.jsx','.py','.java','.c','.h','.cpp','.hpp','.cs','.go','.rs','.rb','.php','.swift','.kt','.kts','.sql','.json','.yaml','.yml','.toml','.xml','.css','.html','.sh','.r','.ipynb','.csv','.tex']);
export function fileType(name,bytes,declaredMime) {
  const ext=path.extname(name).toLowerCase();let mime;
  const zip=bytes[0]===0x50 && bytes[1]===0x4b && [3,5,7].includes(bytes[2]) && [4,6,8].includes(bytes[3]);
  if(ext==='.pdf' && bytes.subarray(0,5).toString()==='%PDF-') mime='application/pdf';
  if(ext==='.png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime='image/png';
  if(['.jpg','.jpeg'].includes(ext) && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) mime='image/jpeg';
  if(zip && ext==='.zip') mime='application/zip';
  if(zip && ext==='.docx') mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if(zip && ext==='.pptx') mime='application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if(textExtensions.has(ext) && !bytes.includes(0) && !bytes.subarray(0,2).equals(Buffer.from('MZ'))) {
    try {new TextDecoder('utf-8',{fatal:true}).decode(bytes);mime=ext==='.md'?'text/markdown':'text/plain';}catch{}
  }
  if(!mime) throw new HttpError(415,'UNSUPPORTED_FILE','文件格式不支持或内容与扩展名不符');
  const declared=(declaredMime||'').split(';')[0];
  if(declared && declared!=='application/octet-stream' && !mime.startsWith('text/') && declared!==mime && !(mime==='application/zip' && declared==='application/x-zip-compressed')) throw new HttpError(415,'MIME_MISMATCH','文件内容与类型不符');
  return mime;
}
export async function readUpload(req,config={}) {
  if(!req) throw new HttpError(400,'FILE_REQUIRED','请选择资料文件');
  const limit=Math.min(config.maxUploadBytes || DEFAULT_LIMIT,DEFAULT_LIMIT);
  return new Promise((resolve,reject)=>{
    let parser;try {parser=Busboy({headers:req.headers,defParamCharset:'utf8',limits:{fileSize:limit+1,files:1,fields:4,fieldSize:1024,parts:5}});}catch{reject(new HttpError(400,'INVALID_MULTIPART','上传格式不正确'));return;}
    let file,problem;const fields={};
    const fail=(status,code,message)=>{problem ||= new HttpError(status,code,message);};
    parser.on('file',(field,stream,info)=>{
      if(field!=='file' || file) {fail(400,'FILE_REQUIRED','只接受一个资料文件');stream.resume();return;}
      file={name:info.filename,mime:info.mimeType,chunks:[],size:0};
      stream.on('limit',()=>fail(413,'FILE_TOO_LARGE','资料不能超过20MiB'));
      stream.on('data',chunk=>{file.size+=chunk.length;if(file.size>limit)fail(413,'FILE_TOO_LARGE','资料不能超过20MiB');if(!problem) file.chunks.push(chunk);});
      stream.on('error',()=>fail(400,'UPLOAD_FAILED','上传中断，请重试'));
    });
    parser.on('field',(name,value,info)=>{if(info.valueTruncated || !['name','subjectId','courseId'].includes(name) || Object.hasOwn(fields,name)) fail(400,'INVALID_FIELD','上传字段无效');else fields[name]=value;});
    parser.on('filesLimit',()=>fail(400,'TOO_MANY_FILES','只接受一个资料文件'));
    parser.on('fieldsLimit',()=>fail(400,'INVALID_FIELD','上传字段过多'));
    parser.on('partsLimit',()=>fail(400,'INVALID_FIELD','上传字段过多'));
    parser.on('error',()=>reject(new HttpError(400,'UPLOAD_FAILED','上传中断，请重试')));
    req.on('aborted',()=>reject(new HttpError(400,'UPLOAD_FAILED','上传中断，请重试')));
    req.on('error',()=>reject(new HttpError(400,'UPLOAD_FAILED','上传中断，请重试')));
    parser.on('close',()=>{
      if(problem) return reject(problem);
      if(!file || !file.name || !file.size) return reject(new HttpError(400,'FILE_REQUIRED','请选择非空资料文件'));
      const name=file.name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,200);const bytes=Buffer.concat(file.chunks);
      try {resolve({fields,bytes,originalName:name,mime:fileType(name,bytes,file.mime),size:bytes.length});}catch(e){reject(e);}
    });req.pipe(parser);
  });
}
