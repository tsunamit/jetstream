(function(root){
 const key=item=>item.id || JSON.stringify(item);
 class Pager {
  constructor(){this.items=[];this.before=null;this.next=null;this.tail={};this.started=false;this.pages=0;}
  query(direction){return direction==='older'?{before:this.before}:this.next?{after:this.next}:{...this.tail};}
  accept(page,query){
   const valid=value=>value==null||typeof value==='string'&&value.length>0&&value.length<=256;
   if(!page||!Array.isArray(page.items)||!valid(page.cursor)||!valid(page.beforeCursor)||page.items.some(i=>!i||typeof i!=='object'))throw Error('Invalid transcript page. Retry loading messages.');
   const existing=new Set(this.items.map(key));
   const additions=page.items.filter(item=>{const id=key(item);if(existing.has(id))return false;existing.add(id);return true;});
   const updates=new Map(page.items.map(item=>[key(item),item]));
   this.items=this.items.map(item=>updates.get(key(item))||item);
   if(query.before)this.items.unshift(...additions);else this.items.push(...additions);
   if(!this.started||query.before)this.before=page.beforeCursor??null;
   if(!query.before){this.next=page.cursor??null;this.tail={...query};}
   this.started=true;this.pages++;
   return query.before?Boolean(this.before&&this.before!==query.before):Boolean(this.next&&this.next!==query.after);
  }
 }
 const exported={Pager,key};
 if(typeof module!=='undefined')module.exports=exported;else root.Transcript=exported;
})(globalThis);
