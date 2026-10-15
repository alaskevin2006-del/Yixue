// Render pixels only; document scripts, attachments and external links are not executed.
export function showPdf(target,blob){
 let closed=false,loading,document,rendering,pageNumber=1;
 const dispose=()=>{closed=true;rendering?.cancel();loading?.destroy().catch(()=>{});};
 (async()=>{
  const pdf=await import('../vendor/pdf.mjs');if(closed)return;
  pdf.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;
  loading=pdf.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,useWasm:false});
  document=await loading.promise;if(closed)return;
  const controls=window.document.createElement('div');controls.className='pdf-controls';
  const previous=window.document.createElement('button'),next=window.document.createElement('button'),label=window.document.createElement('span');
  previous.type=next.type='button';previous.textContent='上一页';next.textContent='下一页';label.setAttribute('role','status');
  const canvas=window.document.createElement('canvas');canvas.className='pdf-canvas';canvas.setAttribute('aria-label','PDF原页预览');
  controls.append(previous,label,next);target.replaceChildren(controls,canvas);
  async function render(){
   previous.disabled=next.disabled=true;label.textContent='正在读取页面…';
   try{const page=await document.getPage(pageNumber);if(closed)return;
    const original=page.getViewport({scale:1}),scale=Math.min(1.6,Math.max(260,target.clientWidth)/original.width),viewport=page.getViewport({scale});
    const pixels=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4000000/(viewport.width*viewport.height)));
    canvas.width=Math.floor(viewport.width*pixels);canvas.height=Math.floor(viewport.height*pixels);
    rendering=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[pixels,0,0,pixels,0,0]});await rendering.promise;page.cleanup();
    if(!closed){label.textContent=`第 ${pageNumber} / ${document.numPages} 页`;previous.disabled=pageNumber===1;next.disabled=pageNumber===document.numPages;}
   }catch(error){if(!closed){label.textContent='这一页预览失败，可下载原文件查看。';previous.disabled=pageNumber===1;next.disabled=pageNumber===document.numPages;}}
  }
  previous.addEventListener('click',()=>{pageNumber--;render();});next.addEventListener('click',()=>{pageNumber++;render();});await render();
 })().catch(()=>{if(!closed&&target.isConnected)target.textContent='PDF预览暂不可用，请下载原文件查看。';});
 return dispose;
}
