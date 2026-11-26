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
  const api = {id,resolve,entity};
  if (typeof module !== 'undefined') module.exports=api; else root.ReferenceTargets=api;
})(globalThis);
