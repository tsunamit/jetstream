(function(root) {
  function matches(text, query, limit=2000) {
    if(!query)return [];
    const sensitive=query!==query.toLowerCase(),result=[];
    const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),sensitive?'gu':'giu');
    for(const match of text.matchAll(pattern)){result.push({start:match.index,end:match.index+match[0].length});if(result.length>=limit)break;}
    return result;
  }
  function index(host, limit=500000) {
    const parts=[],segments=[];let length=0,truncated=false;
    const walk=node=>{
      if(length>=limit){truncated=true;return;}
      if(node.nodeType===3){const text=node.data.slice(0,limit-length);if(text){segments.push({node,start:length,end:length+text.length});parts.push(text);length+=text.length;}return;}
      if(node.nodeType!==1||node.matches('[hidden],script,style,input,textarea,select,.local-find-bar')||getComputedStyle(node).display==='none'||getComputedStyle(node).visibility==='hidden')return;
      const block=/^(block|flex|grid|list-item|table-row)$/.test(getComputedStyle(node).display);
      if((block||node.tagName==='BR')&&length&&parts.at(-1)!=='\n'){parts.push('\n');length++;}
      for(const child of node.childNodes)walk(child);
      if(block&&length&&parts.at(-1)!=='\n'){parts.push('\n');length++;}
    };
    walk(host);return {text:parts.join(''),segments,truncated};
  }
  function range(index,match) {
    const first=index.segments.find(s=>s.end>match.start),last=index.segments.find(s=>s.end>=match.end);
    if(!first||!last)return null;
    const result=document.createRange();result.setStart(first.node,Math.max(0,match.start-first.start));result.setEnd(last.node,Math.min(last.node.length,match.end-last.start));return result;
  }
  const api={matches,index,range};
  if(typeof module!=='undefined')module.exports=api;else root.LocalFind=api;
})(globalThis);
