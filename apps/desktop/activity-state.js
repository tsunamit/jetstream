(function(root){
  const columns=['Needs you','Recently finished','Working'];
  const needs=item=>item.needsYou===true||Boolean(item.ask?.key);
  class State {
    constructor(){this.sent=new Map();this.finished=new Map();this.turns=new Map();this.delivered=new Set();}
    sentReply(id,at=Date.now()){
      this.sent.delete(id);this.sent.set(id,at);this.finished.delete(id);
      while(this.sent.size>200)this.sent.delete(this.sent.keys().next().value);
    }
    frame(id,frame,at=Date.now()){
      const d=frame.data;
      if(frame.event==='turn'&&d.phase==='start'){
        this.turns.set(id,{message:null});
        while(this.turns.size>200)this.turns.delete(this.turns.keys().next().value);
      }
      const turn=this.turns.get(id);
      if(frame.event==='transcript'&&turn&&d.source==='assistant'&&!d.partial)turn.message={id:d.id,text:typeof d.text==='string'?d.text.slice(0,1200):'',cursor:frame.id};
      if(frame.event==='turn'&&d.phase==='end'){
        this.turns.delete(id);
        if(d.outcome!=='settled'||!turn?.message)return false;
        const key=id+':'+turn.message.id;
        if(this.delivered.has(key))return false;
        this.delivered.add(key);
        while(this.delivered.size>400)this.delivered.delete(this.delivered.values().next().value);
        this.finished.delete(id);this.finished.set(id,{...turn.message,at});
        while(this.finished.size>200)this.finished.delete(this.finished.keys().next().value);
        return true;
      }
      if(frame.event==='reset'||frame.event==='done'||frame.event==='connection'||frame.event==='run'&&d.phase==='end')this.turns.delete(id);
      return false;
    }
    read(id,started){if(this.finished.get(id)?.at<=started)this.finished.delete(id);}
    groups(data,now=Date.now()){
      const items=[...new Map([...(data.threads||[]),...(data.captains||[]).map(i=>({...i,isCaptain:true}))].map(i=>[i.id,{...i,parentId:i.parentId||i.captain?.jamId}])).values()];
      const groups=columns.map(()=>[]);
      for(const item of items){
        if(item.archived||item.status==='archived')continue;
        const sentAt=this.sent.get(item.id)||0,completion=this.finished.get(item.id);
        const row={...item,title:item.title||item.name||'Untitled thread',sentAt,completion};
        if(needs(item))groups[0].push(row);
        else if(completion&&item.status!=='working'&&!item.queuedAt)groups[1].push(row);
        else if(item.status==='working'||item.queuedAt||sentAt&&now-sentAt<86400000&&item.status!=='failed')groups[2].push(row);
      }
      const recent=item=>Date.parse(item.lastActivityAt||item.updatedAt||'')||0;
      groups[0].sort((a,b)=>recent(b)-recent(a)||a.id.localeCompare(b.id));
      groups[1].sort((a,b)=>b.completion.at-a.completion.at||a.id.localeCompare(b.id));
      groups[2].sort((a,b)=>b.sentAt-a.sentAt||recent(b)-recent(a)||a.id.localeCompare(b.id));
      return groups;
    }
  }
  const api={State,columns,needs};if(typeof module!=='undefined')module.exports=api;else root.ActivityState=api;
})(globalThis);
