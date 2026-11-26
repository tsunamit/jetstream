(function(root){
  function fuzzy(query,text){
    let offset=0;
    for(const c of query.toLowerCase().replace(/\s/g,'')){
      offset=text.toLowerCase().indexOf(c,offset);
      if(offset<0)return false;
      offset++;
    }
    return true;
  }
  const needs=item=>item.needsYou===true || Boolean(item.ask?.key);
  function contexts(data){
    return [...new Map([...data.threads,...data.captains.map(i=>({...i,isCaptain:true}))].map(i=>[i.id,{...i,parentId:i.parentId||i.captain?.jamId}])).values()];
  }
  function rows(data,query,visits,unread=item=>item.hasUnreads){
    const all=contexts(data),projects=new Map(data.projects.map(p=>[p.id,p]));
    const time=item=>{const t=Date.parse(item.lastActivityAt||item.updatedAt||'');return Number.isFinite(t)?t:0;};
    return all.filter(item=>!item.archived&&item.status!=='archived'&&(query.trim()||!item.parentId||item.isCaptain)).filter(item=>fuzzy(query,[item.title,item.name,item.code,projects.get(item.projectId)?.name,projects.get(item.projectId)?.code].filter(Boolean).join(' '))).sort((a,b)=>Number(needs(b))-Number(needs(a))||Number(unread(b)===true)-Number(unread(a)===true)||(visits.get(b.id)||0)-(visits.get(a.id)||0)||time(b)-time(a)||a.id.localeCompare(b.id)).map(item=>({...item,threadId:item.id,title:item.title||item.name||'Untitled thread',reason:needs(item)?'Needs input':unread(item)===true?'Unread':'Recent',detail:item.ask?.text||data.activity.find(a=>a.threadId===item.id)?.detail||'Latest message not loaded.'}));
  }
  const api={contexts,rows,needs};if(typeof module!=='undefined')module.exports=api;else root.CentralSearch=api;
})(globalThis);
