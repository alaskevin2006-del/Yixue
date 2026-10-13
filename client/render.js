import {Marked} from '../vendor/marked.esm.js';
import DOMPurify from '../vendor/purify.es.mjs';
import katex from '../vendor/katex/katex.mjs';
import {el} from './ui.js';

const markdown=new Marked({breaks:true,gfm:true});
const escapeHtml=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Markdown otherwise consumes the backslashes in standard TeX delimiters.
// A tokenizer preserves them as escaped text without touching code tokens.
markdown.use({extensions:[{name:'tex-delimiters',level:'inline',start(source){const matches=[source.indexOf('\\('),source.indexOf('\\[')].filter(index=>index>=0);return matches.length?Math.min(...matches):undefined;},tokenizer(source){const match=/^\\\(([\s\S]+?)\\\)|^\\\[([\s\S]+?)\\\]/.exec(source);if(match)return{type:'tex-delimiters',raw:match[0]};},renderer(token){return escapeHtml(token.raw);}}]});

// Provider/user content is untrusted. Sanitize before inserting HTML; formula
// rendering only touches text outside code and KaTeX trust stays disabled.
export function richText(content) {
  const node=el('div','rich-text');
  node.innerHTML=DOMPurify.sanitize(markdown.parse(String(content || '')), {FORBID_TAGS:['img','style','iframe','object','svg','math','form','input','button'],FORBID_ATTR:['style']});
  node.querySelectorAll('a').forEach(link=>{link.target='_blank';link.rel='noopener noreferrer';});
  const walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT,{acceptNode:text=>text.parentElement?.closest('pre,code,a')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const texts=[];while(walk.nextNode())texts.push(walk.currentNode);
  for(const text of texts) {
    const value=text.nodeValue; const expression=/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$([^$\n]+?)\$/g;
    let match;let start=0;const fragment=document.createDocumentFragment();let found=false;
    while((match=expression.exec(value))) {
      found=true;fragment.append(document.createTextNode(value.slice(start,match.index)));
      const math=el('span','formula'); const formula=match[1]??match[2]??match[3]??match[4];
      try{katex.render(formula,math,{displayMode:match[1]!=null||match[2]!=null,throwOnError:false,trust:false,strict:'warn',output:'htmlAndMathml',maxExpand:200});}catch{math.textContent=match[0];}
      fragment.append(math);start=match.index+match[0].length;
    }
    if(found){fragment.append(document.createTextNode(value.slice(start)));text.replaceWith(fragment);}
  }
  node.querySelectorAll('pre').forEach(pre=>{const code=pre.querySelector('code');if(!code)return;const copy=el('button','code-copy','复制代码');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code.textContent);copy.textContent='已复制';}catch{copy.textContent='复制失败';}setTimeout(()=>copy.textContent='复制代码',1600);});pre.append(copy);});
  return node;
}
