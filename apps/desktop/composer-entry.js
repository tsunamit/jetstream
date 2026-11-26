import {EditorState, EditorSelection, Transaction, Compartment} from '@codemirror/state';
import {EditorView, drawSelection, keymap} from '@codemirror/view';
import {history, defaultKeymap, isolateHistory, undoDepth} from '@codemirror/commands';
import {vim, Vim, getCM} from '@replit/codemirror-vim';

for (const [name,prefix] of [['write','w'],['quit','q'],['wq','wq'],['xit','x'],['read','r'],['edit','e'],['source','so'],['javascript','javascript'],['js','js'],['lua','lua'],['shell','sh'],['terminal','ter'],['file','f'],['saveas','sav']]) {
  Vim.defineEx(name,prefix,() => {document.getElementById('notice').textContent='Unavailable: this composer has no files, shell or scripts.';});
}
let insertEscapes=[];
function setInsertEscapes(sequences,timeout) {
  for (const sequence of insertEscapes) Vim.unmap(sequence,'insert');
  insertEscapes=[...sequences];
  for (const sequence of insertEscapes) Vim.map(sequence,'<Esc>','insert');
  Vim.setOption('insertModeEscKeysTimeout',timeout);
}
class Controller {
  constructor(host,changed) {
    this.host = host; this.changed = changed; this.views = new Map(); this.id = null; this.disabled = true;
    Object.defineProperties(host, {
      value:{get:()=>this.view?.state.doc.toString() ?? '',set:text=>this.setText(text)},
      selectionStart:{get:()=>this.view?.state.selection.main.from ?? 0},
      selectionEnd:{get:()=>this.view?.state.selection.main.to ?? 0},
      disabled:{get:()=>this.disabled,set:value=>this.setDisabled(value)}
    });
    host.setSelectionRange = (from,to) => {if(!this.view)return;const clamp=p=>Math.max(0,Math.min(p,this.view.state.doc.length));this.view.dispatch({selection:EditorSelection.single(clamp(from),clamp(to))});};
    host.focus = () => this.view?.focus();
    host.addEventListener('click',event => {if (event.target === host) this.view?.focus();});
  }
  get view() {return this.views.get(this.id)?.view;}
  measure() {this.view?.requestMeasure();}
  state() {return this.view && getCM(this.view)?.state.vim;}
  mode() {const s=this.state(); return s?.insertMode ? 'insert' : s?.visualMode ? s.visualBlock ? 'visual block' : s.visualLine ? 'visual line' : 'visual' : 'normal';}
  focused() {return this.host.contains(document.activeElement);}
  prompt(target = document.activeElement) {return this.focused() && !this.view?.contentDOM.contains(target);}
  idle() {
    const s=this.state(), i=s?.inputState;
    return !!s && !s.insertMode && !s.visualMode && !s.insertModeReturn && !s.expectLiteralNext && !i?.operator && !i?.keyBuffer?.length && !i?.prefixRepeat?.length && !i?.motionRepeat?.length && !i?.registerName;
  }
  switchTo(id,text='') {
    this.host.dispatchEvent(new Event('editor-context-change'));
    this.id=id ?? '__empty__';
    if (!this.views.has(this.id)) {
      const record={editable:new Compartment(),view:null};
      const key=this.id;
      const view = new EditorView({state:EditorState.create({doc:text,extensions:[
        vim(), drawSelection(), EditorState.allowMultipleSelections.of(true), EditorView.lineWrapping,
        history({newGroupDelay:1e12,joinToEvent:()=>Boolean(getCM(record.view)?.state.vim.insertMode)}),
        keymap.of(defaultKeymap), record.editable.of(EditorView.editable.of(!this.disabled)),
        EditorView.contentAttributes.of({'aria-label':'Reply','aria-multiline':'true',role:'textbox',spellcheck:'false'}),
        EditorState.transactionFilter.of(tr => {if(tr.newDoc.length<=30000)return tr; this.host.dispatchEvent(new Event('limit'));return [];}),
        EditorState.transactionExtender.of(tr => !tr.docChanged ? {annotations:Transaction.addToHistory.of(false)} : !getCM(record.view)?.state.vim.insertMode ? {annotations:isolateHistory.of('before')} : null),
        EditorView.updateListener.of(update => {
          if (update.docChanged) this.changed?.(key,update.state.doc.toString());
          if (this.id===key) {this.host.dispatchEvent(new Event('select')); if(update.docChanged) this.host.dispatchEvent(new Event('input',{bubbles:true}));}
        }),
        EditorView.theme({
          '&':{fontSize:'15px',backgroundColor:'#292c2f',color:'#e6ebe7',borderRadius:'16px'},
          '.cm-scroller':{fontFamily:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',minHeight:'70px',maxHeight:'180px',overflow:'auto',lineHeight:'1.5'},
          '.cm-content':{padding:'14px 17px',whiteSpace:'pre-wrap'},'.cm-line':{padding:'0'},
          '&.cm-focused':{outline:'2px solid #bad3c4'},'.cm-cursor, .cm-dropCursor':{borderLeftColor:'#bad3c4'},
          '.cm-vimMode .cm-fat-cursor':{background:'#bad3c4',color:'#132318',border:'none'},
          '&.cm-focused .cm-selectionBackground,.cm-selectionBackground':{backgroundColor:'#675578'},
          '.cm-panels':{backgroundColor:'#202629',color:'#e6ebe7'},'.cm-panels input':{fontFamily:'inherit'}
        })
      ]})});
      record.view=view; view.contentDOM.id='draft-input'; this.views.set(key,record);
      getCM(view).on('vim-mode-change',()=>{
        this.host.dispatchEvent(new Event('editor-mode-change'));
        this.host.dispatchEvent(new Event('select'));
        if(!getCM(view).state.vim.insertMode) queueMicrotask(()=>view.dispatch({annotations:[isolateHistory.of('full'),Transaction.addToHistory.of(false)]}));
      });
      Vim.handleKey(getCM(view),'i','api');
    }
    this.host.replaceChildren(this.view.dom); this.setDisabled(this.disabled); this.host.dispatchEvent(new Event('select'));
  }
  setDisabled(value) {this.disabled=Boolean(value); const r=this.views.get(this.id); if(r) r.view.dispatch({effects:r.editable.reconfigure(EditorView.editable.of(!this.disabled))});}
  setText(text) {if (this.view && text.length<=30000) this.view.dispatch({changes:{from:0,to:this.view.state.doc.length,insert:text},annotations:[Transaction.addToHistory.of(false),isolateHistory.of('full')]});}
  insert(append=false) {if(this.disabled)return; if(!this.state()?.insertMode) {Vim.handleKey(getCM(this.view),'<Esc>','api');Vim.handleKey(getCM(this.view),append?'a':'i','api');} this.view.focus();}
  normal() {if(this.state()?.insertMode) Vim.exitInsertMode(getCM(this.view),true); else Vim.handleKey(getCM(this.view),'<Esc>','api'); this.view.focus();}
  key(key) {if(this.view) Vim.handleKey(getCM(this.view),key,'api');}
  snapshot() {return this.view ? {selection:this.view.state.selection.toJSON(),mode:this.mode(),scroll:this.view.scrollDOM.scrollTop} : null;}
  restore(snapshot) {
    if(!snapshot || !this.view)return;
    const cm=getCM(this.view);
    if(this.mode()!==snapshot.mode) {
      Vim.handleKey(cm,'<Esc>','api');
      if(snapshot.mode==='insert') Vim.handleKey(cm,'i','api');
      else if(snapshot.mode.startsWith('visual')) Vim.handleKey(cm,snapshot.mode==='visual block'?'<C-v>':snapshot.mode==='visual line'?'V':'v','api');
    }
    const length=this.view.state.doc.length;
    this.view.dispatch({selection:EditorSelection.create(snapshot.selection.ranges.map(r=>EditorSelection.range(Math.min(r.anchor,length),Math.min(r.head,length))),snapshot.selection.main)});
    this.view.scrollDOM.scrollTop=snapshot.scroll;
  }
  clearSent(id,doc) {const view=this.views.get(id)?.view; if(!view || view.state.doc!==doc)return false; view.dispatch({changes:{from:0,to:doc.length,insert:''},annotations:[Transaction.addToHistory.of(false),isolateHistory.of('full')]}); return true;}
}
globalThis.ComposerEngine={Controller,Vim,getCM,EditorSelection,undoDepth,setInsertEscapes};
