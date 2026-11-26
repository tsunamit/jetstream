(function(root){
  class State {
    constructor(){this.items=new Map();this.version=0;}
    get(id){
      if(!this.items.has(id)){
        this.items.set(id,{revision:0,value:undefined,hold:false,pending:false,error:'',attempted:null});
      }
      return this.items.get(id);
    }
    accept(item,started=Infinity){
      const s=this.get(item.id);
      if(typeof item.hasUnreads==='boolean' && !s.pending && s.revision<=started){s.value=item.hasUnreads;s.error='';s.revision=++this.version;}
      return {...item,...(typeof s.value==='boolean'?{hasUnreads:s.value}:{})};
    }
    touch(id){const s=this.get(id);s.revision=++this.version;return s.revision;}
    begin(id,action){const s=this.get(id);this.touch(id);s.pending=true;s.error='';if(action==='unread'){s.hold=true;s.attempted=null;}else s.hold=false;return s.revision;}
    finish(id,revision,result,error){
      const s=this.get(id);s.pending=false;
      if(error)s.error='Not synced · retry explicitly';
      else if(s.revision===revision && typeof result?.hasUnreads==='boolean')s.value=result.hasUnreads;
      this.touch(id);
    }
    visit(id,previous){if(id&&id!==previous){this.get(id).hold=false;this.get(id).attempted=null;}}
  }
  const api={State};if(typeof module!=='undefined')module.exports=api;else root.UnreadState=api;
})(globalThis);
