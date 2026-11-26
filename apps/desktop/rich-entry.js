import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const httpsURL = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};
let diagramId = 0;
function scrollable(node, label) {
  node.tabIndex = 0;
  node.setAttribute('aria-label',label);
  node.addEventListener('keydown',event => {
    if(event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.target!==node)return;
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Home')node.scrollLeft=0;
    else if(event.key==='End')node.scrollLeft=node.scrollWidth;
    else node.scrollLeft+=event.key==='ArrowLeft'?-48:48;
  });
  return node;
}
mermaid.initialize({ startOnLoad:false, securityLevel:'strict', theme:'base', htmlLabels:false, suppressErrorRendering:true,
  themeVariables:{darkMode:true, dropShadow:'none', fontFamily:'ui-monospace,SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono",monospace', fontSize:'14px', primaryColor:'#303638', primaryBorderColor:'#303638', primaryTextColor:'#e7e8e9', secondaryColor:'#29322e', secondaryTextColor:'#e7e8e9', secondaryBorderColor:'#29322e', tertiaryColor:'#24282a', tertiaryTextColor:'#e7e8e9', tertiaryBorderColor:'#24282a', lineColor:'#a2a7ab', textColor:'#e7e8e9', mainBkg:'#303638', nodeBorder:'#303638', actorBkg:'#303638', actorBorder:'#303638', actorTextColor:'#e7e8e9', signalColor:'#a2a7ab', signalTextColor:'#e7e8e9', labelBoxBkgColor:'#24282a', labelBoxBorderColor:'#24282a', labelTextColor:'#e7e8e9', noteBkgColor:'#29322e', noteBorderColor:'#29322e', noteTextColor:'#e7e8e9'},
  flowchart:{htmlLabels:false}, sequence:{useMaxWidth:true}, maxTextSize:20000,
  secure:['securityLevel','startOnLoad','maxTextSize','suppressErrorRendering','theme','themeVariables','flowchart','htmlLabels'] });

function button(label, action, scope = () => true) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.onclick = async () => {
    const owner = scope(), valid = () => owner !== null && scope() === owner;
    if (!valid()) return;
    node.disabled = true;
    try { await action(node, valid); } catch { if (valid()) node.textContent = 'Unavailable · retry'; }
    finally { node.disabled = false; }
  };
  return node;
}

const automaticImages = new WeakMap();
const imageObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    imageObserver.unobserve(entry.target);
    automaticImages.get(entry.target)?.();
  }
}, {root:document.getElementById('transcript'), rootMargin:'240px'});
new MutationObserver(records => {
  const visit = (node, action) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches('[data-auto-image]')) action(node);
    node.querySelectorAll('[data-auto-image]').forEach(action);
  };
  for (const record of records) {
    record.removedNodes.forEach(node => visit(node, box => imageObserver.unobserve(box)));
    record.addedNodes.forEach(node => visit(node, box => {
      if (box.isConnected && automaticImages.has(box)) imageObserver.observe(box);
    }));
  }
}).observe(document.getElementById('entries'), {childList:true, subtree:true});

async function render(item, threadId, scope = () => true) {
  const renderButton = (label, action) => button(label, action, scope);
  const root = document.createElement('div');
  root.className = 'markdown';
  const images = [];
  const targets = [];
  const context = {attachments:item.attachments,references:item.references};
  const targetFor = href => {
    const target = ReferenceTargets.resolve(href,context);
    if(target?.kind==='attachment') {
      const file=item.attachments.find(row=>row.file.fileId===target.fileId).file;
      return {...target,threadId,messageId:item.id,image:/^image\/(png|jpeg|gif|webp)$/.test(file.mediaType)};
    }
    return target;
  };
  const renderer = new marked.Renderer();
  renderer.html = ({text}) => escape(text);
  renderer.image = ({href, text}) => {
    images.push({href, text});
    return '<span data-media="' + (images.length - 1) + '"></span>';
  };
  renderer.link = function({href, tokens}) {
    const label = this.parser.parseInline(tokens);
    const target = targetFor(href);
    if(!target)return label;
    targets.push(target);
    return '<a data-ref="'+(targets.length-1)+'">'+label+'</a>';
  };
  root.innerHTML = DOMPurify.sanitize(marked.parse(String(item.text ?? '').slice(0, 200000), {renderer, gfm:true, breaks:true}), {
    ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','strong','em','del','ul','ol','li','blockquote','table','thead','tbody','tr','th','td','pre','code','hr','a','span'],
    ALLOWED_ATTR:['href','class','data-media','align','start'], ALLOW_DATA_ATTR:false, ADD_ATTR:['data-media','data-ref']
  });
  for (const a of root.querySelectorAll('a')) {
    const target=targets[Number(a.dataset.ref)];
    a.removeAttribute('data-ref');
    if(target)referenceNavigation.bind(a,target);
  }
  ReferenceTargets.decorate(root,referenceNavigation.codes(),referenceNavigation.bind);
  const files = (Array.isArray(item.attachments) ? item.attachments : []).filter(a => a?.file?.fileId);
  const used = new Set();
  const media = async (file, title, snapshot = false) => {
    const box = document.createElement('div');
    box.className = 'attachment';
    const name = document.createElement('a');
    name.textContent = title || file.name || 'Attachment';
    const target={kind:'attachment',threadId,messageId:item.id,fileId:file.fileId,label:title || file.name || 'Attachment',snapshot,image:/^image\/(png|jpeg|gif|webp)$/.test(file.mediaType)};
    referenceNavigation.bind(name,target);
    box.append(name);
    if (/^image\/(png|jpeg|gif|webp)$/.test(file.mediaType)) {
      const image = document.createElement('button'); image.type = 'button'; image.className = 'image-button';
      image.setAttribute('aria-label', 'Enlarge ' + (title || file.name || 'Image'));
      image.replaceChildren(document.createTextNode('Image loading…'));
      image.onclick = async () => {
        if(scope() !== null && box.isConnected)await referenceNavigation.preview(target);
      };
      referenceNavigation.register(image,target);
      const hint = document.createElement('span'); hint.className = 'image-hint';
      hint.textContent = globalThis.imagePreviewHint?.() || 'Enter opens preview · Esc closes';
      box.append(hint);
      const loadImage = async auto => {
        const owner = scope(), valid = () => owner !== null && scope() === owner;
        if (auto && box.dataset.attempted) return;
        if (!valid() || !box.isConnected) return;
        load.disabled = true;
        try {
          const result = await window.desk.media(threadId, file.fileId, auto ? 'auto-preview' : 'preview');
          const img = new Image(); img.alt = title || file.name || 'Image'; img.src = result.data;
          await img.decode();
          if (!valid() || !box.isConnected) return;
          const update = () => { image.replaceChildren(img); image.dataset.loaded = 'true'; box.dataset.attempted = 'true'; load.remove(); };
          if (globalThis.preserveMediaLayout) globalThis.preserveMediaLayout(update); else update();
        } catch {
          if (valid() && box.isConnected) { box.dataset.attempted = 'true'; image.textContent = 'Image unavailable'; load.textContent = 'Load image · retry'; }
        } finally { load.disabled = false; }
      };
      const load = renderButton('Load image', () => loadImage(false));
      box.prepend(image);
      box.append(load);
      automaticImages.set(box, () => loadImage(true));
      box.dataset.autoImage = '';
    }
    box.append(renderButton('Save file…', async (node, valid) => {
      const result = await window.desk.media(threadId, file.fileId, 'save');
      if (!valid()) return;
      node.textContent = result.canceled ? 'Save file…' : 'Saved · save again…';
    }));
    return box;
  };
  for (const span of root.querySelectorAll('[data-media]')) {
    const {href, text} = images[Number(span.dataset.media)] ?? {};
    const target=targetFor(href);
    const attachment = files.find(a => a.file.fileId === target?.fileId || a.file.fileId === href || 'capy-file:' + a.file.fileId === href || a.file.sourcePath === href);
    if (attachment) { used.add(attachment.file.fileId); span.replaceWith(await media(attachment.file, text, Boolean(target?.snapshot))); }
    else {
      const safe = httpsURL(href);
      span.replaceWith(safe ? renderButton('Open remote image in browser: ' + (text || 'image'), () => window.desk.openLink(safe)) : document.createTextNode('[Image unavailable: ' + (text || 'unsupported reference') + ']'));
    }
  }
  for (const a of files) if (!used.has(a.file.fileId)) root.append(await media(a.file, a.title));
  for(const ref of Array.isArray(item.references)?item.references:[]) {
    if(files.some(row=>row.file.fileId===ref.fileId))continue;
    const note=document.createElement('span');note.className='reference-unavailable';note.textContent=(ref.title || ref.path || 'Drive file')+' · No attached copy; Drive browsing is unavailable.';root.append(note);
  }
  for (const pre of root.querySelectorAll('pre')) {
    scrollable(pre,'Code · scroll with arrow keys');
    const code = pre.querySelector('code');
    if (!code) continue;
    const source = code.textContent;
    const block = document.createElement('div');
    block.className = 'code-block';
    pre.replaceWith(block);
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    const language = document.createElement('span');
    language.textContent = code.className.replace('language-', '') || 'text';
    toolbar.append(language, renderButton('Copy code', async (node, valid) => {
      await window.desk.copyText(source);
      if (!valid()) return;
      node.textContent = 'Copied';
    }));
    block.append(toolbar, pre);
    if (code.classList.contains('language-mermaid')) {
      const diagram = document.createElement('div');
      diagram.className = 'diagram';
      scrollable(diagram,'Diagram · scroll with arrow keys');
      block.append(diagram);
      try {
        if (source.length > 20000 || /%%\{|^\s*---|\b(click|classDef|linkStyle|style)\s|<|\bhttps?:|\bdata:|@import|url\(/im.test(source)) throw new Error('Unsupported diagram');
        const {svg} = await mermaid.render('diagram-' + (++diagramId), source);
        diagram.innerHTML = DOMPurify.sanitize(svg, {USE_PROFILES:{svg:true, svgFilters:true}, FORBID_TAGS:['foreignObject','a','image','use','script'], FORBID_ATTR:['href','xlink:href','onload','onclick']});
        for (const node of diagram.querySelectorAll('*')) for (const attr of [...node.attributes]) {
          if ([...attr.value.matchAll(/url\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^['"]|['"]$/g, '').startsWith('#'))) node.removeAttribute(attr.name);
        }
        for (const style of diagram.querySelectorAll('style')) {
          const urls = [...style.textContent.matchAll(/url\(([^)]*)\)/gi)];
          if (/@import/i.test(style.textContent) || urls.some(match => !match[1].trim().replace(/^['"]|['"]$/g, '').startsWith('#'))) style.remove();
        }
        const details = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = 'Diagram source';
        details.append(summary, pre); block.append(details);
        const open=document.createElement('button');open.type='button';open.textContent='Open diagram source';
        referenceNavigation.bind(open,{kind:'diagram',threadId,messageId:item.id,index:[...root.querySelectorAll('.code-block')].indexOf(block),label:'Diagram source'});
        toolbar.append(open);
      } catch { diagram.textContent = 'Diagram unavailable. Source is shown above.'; }
    }
  }
  for(const table of root.querySelectorAll('table'))scrollable(table,'Table · scroll with arrow keys');
  return root;
}
window.richText = {render,scrollable};
