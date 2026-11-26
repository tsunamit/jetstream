(function(root){
  const columns=['Needs you','Recently finished','Working','Recent replies'];
  const needs=item=>item.needsYou===true||Boolean(item.ask?.key);
  class TurnObserver{
    constructor(){this.turns=new Map();}
    frame(id,frame,at=Date.now()){
      const d=frame.data;
      if(frame.event==='turn'&&d.phase==='start'){this.turns.set(id,{message:null,settled:false});while(this.turns.size>200)this.turns.delete(this.turns.keys().next().value);}
      const turn=this.turns.get(id);
      if(frame.event==='transcript'&&turn&&d.source==='assistant'&&!d.partial&&typeof d.id==='string'&&d.id.length&&d.id.length<=256&&typeof frame.id==='string'&&frame.id.length&&frame.id.length<=256){
        turn.message={id:d.id,cursor:frame.id,createdAt:d.createdAt};if(turn.settled)return {...turn.message,at};
      }
      if(frame.event==='turn'&&d.phase==='end'){
        if(d.outcome!=='settled'){this.turns.delete(id);return null;}
        if(turn){turn.settled=true;if(turn.message)return {...turn.message,at};}
      }
      if(frame.event==='reset'||frame.event==='done'||frame.event==='connection'||frame.event==='run'&&d.phase==='end')this.turns.delete(id);
      return null;
    }
  }
  class State {
    constructor(){this.sent=new Map();this.finished=new Map();this.observer=new TurnObserver();this.delivered=new Set();this.texts=new Map();}
    sentReply(id,at=Date.now()){
      this.sent.delete(id);this.sent.set(id,at);this.finished.delete(id);
      while(this.sent.size>200)this.sent.delete(this.sent.keys().next().value);
    }
    frame(id,frame,at=Date.now()){
      if(frame.event==='transcript'&&frame.data.source==='assistant'&&!frame.data.partial){this.texts.set(id+':'+frame.data.id,typeof frame.data.text==='string'?frame.data.text.slice(0,1200):'');while(this.texts.size>200)this.texts.delete(this.texts.keys().next().value);}
      const settled=this.observer.frame(id,frame,at);
      if(settled){
        const key=id+':'+settled.id;
        if(this.delivered.has(key))return false;
        this.delivered.add(key);
        while(this.delivered.size>400)this.delivered.delete(this.delivered.values().next().value);
        this.finished.delete(id);this.finished.set(id,{...settled,text:this.texts.get(key)||''});
        while(this.finished.size>200)this.finished.delete(this.finished.keys().next().value);
        return true;
      }
      return false;
    }
    read(id,started){if(this.finished.get(id)?.at<=started)this.finished.delete(id);}
    restore(events){
      const prior=this.finished;this.sent=new Map();this.finished=new Map();this.delivered=new Set();
      for(const event of events){
        if(event.kind==='sent')this.sentReply(event.threadId,event.at);
        else if(event.kind==='settled'){
          this.delivered.add(event.threadId+':'+event.id);
          this.finished.set(event.threadId,{id:event.id,cursor:event.cursor,at:event.at,text:prior.get(event.threadId)?.id===event.id?prior.get(event.threadId).text:''});
        }else if(event.kind==='read')this.read(event.threadId,event.started);
      }
    }
    groups(data,now=Date.now()){
      const items=[...new Map([...(data.threads||[]),...(data.captains||[]).map(i=>({...i,isCaptain:true}))].map(i=>[i.id,{...i,parentId:i.parentId||i.captain?.jamId}])).values()];
      const groups=columns.map(()=>[]);
      for(const item of items){
        if(item.archived||item.status==='archived')continue;
        const sentAt=this.sent.get(item.id)||0,completion=this.finished.get(item.id);
        const row={...item,title:item.title||item.name||'Untitled thread',sentAt,completion};
        if(needs(item))groups[0].push(row);
        else if(completion&&item.status!=='working'&&!item.queuedAt)groups[1].push(row);
        else if(item.status==='working'||item.queuedAt)groups[2].push(row);
        else if(sentAt&&now-sentAt<30*86400000)groups[3].push(row);
      }
      const recent=item=>Date.parse(item.lastActivityAt||item.updatedAt||'')||0;
      groups[0].sort((a,b)=>recent(b)-recent(a)||a.id.localeCompare(b.id));
      groups[1].sort((a,b)=>b.completion.at-a.completion.at||a.id.localeCompare(b.id));
      groups[2].sort((a,b)=>b.sentAt-a.sentAt||recent(b)-recent(a)||a.id.localeCompare(b.id));
      groups[3].sort((a,b)=>b.sentAt-a.sentAt||a.id.localeCompare(b.id));
      return groups;
    }
  }
  const api={State,TurnObserver,columns,needs};if(typeof module!=='undefined')module.exports=api;else root.ActivityState=api;
})(globalThis);
