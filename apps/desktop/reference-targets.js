(function(root) {
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
  function resolve(value, context = {}) {
    if (typeof value !== 'string' || value.length > 16000) return null;
    const files = Array.isArray(context.attachments)?context.attachments:[], references = Array.isArray(context.references)?context.references:[];
    const file = files.find(row => row?.file && value === 'capy-file:' + row.file.fileId);
    if (file && id(file.file.fileId)) return {kind:'attachment',fileId:file.file.fileId,label:file.title || file.file.name};
    if(value.startsWith('capy-file:'))return {kind:'unavailable',label:'Attachment reference',reason:'Attachment is not carried by this message.'};
    if (value.startsWith('drive://')) {
      const ref = references.find(row => row && value === 'drive://' + row.location + '/' + row.path);
      const copy = ref && files.find(row => row?.file?.fileId === ref.fileId);
      return copy && id(ref.fileId) ? {kind:'attachment',fileId:ref.fileId,label:ref.title || copy.file.name,snapshot:true} : {kind:'unavailable',label:'Drive reference',reason:'No attached copy is available. Drive browsing is not supported by this API.'};
    }
    if (value.startsWith('capy://')) {
      const match = /^capy:\/\/(thread|captain|message)\/([A-Za-z0-9_-]{1,160})$/.exec(value);
      return match ? {kind:match[1],id:match[2],label:match[1] + ' ' + match[2]} : {kind:'unavailable',label:'Internal reference',reason:'Unsupported internal reference.'};
    }
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')) return {kind:'external',url:url.href,label:'External website'};
    } catch {}
    return null;
  }
  function entity(target, rows) {
    const matches = rows.filter(row => target.kind === 'code' ? row.code === target.id : row.id === target.id);
    const unique = [...new Map(matches.map(row=>[row.id,row])).values()];
    if (unique.length !== 1) return {error:unique.length ? 'Reference is ambiguous.' : 'Reference is not in the available workspace.'};
    const item = unique[0];
    if (target.kind === 'captain' && !item.isCaptain || target.kind === 'thread' && item.isCaptain) return {error:'Reference type does not match this context.'};
    return {item};
  }
  function tokens(text, {rows = [], prefixes = []} = {}) {
    if (typeof text !== 'string') return [];
    const known = new Set(rows.map(row=>row.code).filter(code=>typeof code==='string'));
    const allowed = new Set(prefixes.filter(prefix=>typeof prefix==='string' && /^[A-Z][A-Z0-9]{0,31}$/.test(prefix)));
    for (const code of known) {
      const match=/^([A-Z][A-Z0-9]{0,31})-[0-9]+$/.exec(code);
      if(match)allowed.add(match[1]);
    }
    const identities=new Map();
    for(const row of rows)if(known.has(row.code)) {
      if(!identities.has(row.code))identities.set(row.code,new Set());
      identities.get(row.code).add(row.id);
    }
    const result=[], source=text.slice(0,200000);
    let wordStart=0,wordEnd=0,wordBlocked=false,colon=-1;
    for (const match of source.matchAll(/(?<![\p{L}\p{N}_-])[A-Z][A-Z0-9]{0,31}-[A-Z0-9]{1,32}(?![\p{L}\p{N}_-])/gu)) {
      const code=match[0], start=match.index, end=start+code.length;
      if(start>=wordEnd) {
        wordStart=start;while(wordStart>0&&!/\s/.test(source[wordStart-1]))wordStart--;
        wordEnd=end;while(wordEnd<source.length&&!/\s/.test(source[wordEnd]))wordEnd++;
        const word=source.slice(wordStart,wordEnd);
        wordBlocked=/[\/@]/.test(word);colon=word.indexOf(':');
      }
      if (wordBlocked || colon>=0 && wordStart+colon<start) continue;
      if (end===source.length && /[\p{L}\p{N}_-]/u.test(text[end]||'')) continue;
      if (!known.has(code) && !(/^[A-Z][A-Z0-9]*-[0-9]+$/.test(code) && allowed.has(code.slice(0,code.lastIndexOf('-'))))) continue;
      result.push({start,end,code,confirmed:identities.get(code)?.size===1});
      if(result.length===1000)break;
    }
    return result;
  }
  function decorate(root, context, bind) {
    const groups=[];let group=[];
    const flush=()=>{if(group.length)groups.push(group);group=[];};
    const blocks=new Set(['P','BR','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','TD','TH','HR','UL','OL','TABLE']);
    const visit=node=>{
      if(node.nodeType===3){group.push(node);return;}
      if(node.nodeType!==1)return;
      if(node.matches('a,pre,code,[data-reference],[data-media]')){flush();return;}
      const block=blocks.has(node.tagName);
      if(block)flush();
      for(const child of [...node.childNodes])visit(child);
      if(block)flush();
    };
    visit(root);flush();
    const text=groups.map(nodes=>nodes.map(node=>node.data).join('')).join('\n'),matches=tokens(text,context);
    if(!matches.length)return;
    let offset=0,first=0;
    for(const nodes of groups) {
      for(const node of nodes) {
        const start=offset;offset+=node.length;
        while(first<matches.length&&matches[first].end<=start)first++;
        const overlaps=[];
        for(let index=first;index<matches.length&&matches[index].start<offset;index++)overlaps.push(matches[index]);
        if(!overlaps.length)continue;
        const fragment=root.ownerDocument.createDocumentFragment();let position=0;
        for(const match of overlaps) {
          const from=Math.max(0,match.start-start),to=Math.min(node.length,match.end-start);
          fragment.append(node.data.slice(position,from));
          const link=root.ownerDocument.createElement('a');link.textContent=node.data.slice(from,to);
          bind(link,{kind:'code',id:match.code,label:match.code});
          if(!match.confirmed){link.classList.add('reference-candidate');link.setAttribute('aria-label',match.code+' · unresolved reference');}
          fragment.append(link);position=to;
        }
        fragment.append(node.data.slice(position));node.replaceWith(fragment);
      }
      offset++;
    }
  }
  const api = {id,resolve,entity,tokens,decorate};
  if (typeof module !== 'undefined') module.exports=api; else root.ReferenceTargets=api;
})(globalThis);
