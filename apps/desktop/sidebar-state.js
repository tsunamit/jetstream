(function(root){
  const defaults=()=>({version:1,mode:'tree',sort:'recent',project:'current',status:'all',text:'',archive:false,counts:true,projectRoots:false,sections:['threads','captains'],expanded:[],createDefaults:{}});
  function config(value) {
    if (!value || typeof value!=='object' || Array.isArray(value) || JSON.stringify(value).length>64000) throw Error('Invalid work-tree configuration.');
    if (Object.keys(value).some(k=>!Object.hasOwn(defaults(),k))) throw Error('Unknown work-tree option.');
    const c={...defaults(),...value};
    if(c.version!==1 || !['tree','activity'].includes(c.mode) || !['recent','name','status'].includes(c.sort) || !['all','unread','needs-you','working','waiting','idle','failed','archived'].includes(c.status) || typeof c.project!=='string' || typeof c.text!=='string' || c.text.length>200 || typeof c.archive!=='boolean' || typeof c.counts!=='boolean') throw Error('Invalid work-tree options.');
    if(typeof c.projectRoots!=='boolean')throw Error('Invalid project roots option.');
    if(!Array.isArray(c.sections) || new Set(c.sections).size!==c.sections.length || c.sections.some(s=>!['threads','captains'].includes(s))) throw Error('Invalid sections.');
    if(!Array.isArray(c.expanded) || c.expanded.length>1000 || c.expanded.some(id=>typeof id!=='string'||id.length>160)) throw Error('Invalid expansion state.');
    if(!c.createDefaults || Array.isArray(c.createDefaults) || typeof c.createDefaults!=='object' || Object.keys(c.createDefaults).length>200) throw Error('Invalid creation defaults.');
    for(const [id,d] of Object.entries(c.createDefaults)) {
      if(id.length>160 || !d || Object.keys(d).some(k=>!['modelId','reasoningMode','machineSize','modes'].includes(k)) || Object.entries(d).some(([k,v])=>k==='modes' ? !v || typeof v!=='object' || Object.entries(v).some(([m,b])=>!['fast','pro','ultrafast'].includes(m)||typeof b!=='boolean') : typeof v!=='string'||v.length>200)) throw Error('Invalid project defaults.');
    }
    return JSON.parse(JSON.stringify(c));
  }
  const status=item=>item.archived ? 'archived' : item.needsYou || item.owed ? 'needs-you' : item.status ?? 'idle';
  class State {
    constructor(){this.data={projects:[],threads:[],captains:[],activity:[]};this.finished=new Map();this.seen=new Map();this.stale=true;this.error='Not loaded';this.updated=0;}
    accept(data,at=Date.now()){
      if(this.updated&&at-this.updated>120000)this.seen.clear();
      const ids=new Set([...data.threads,...data.captains].map(i=>i.id));
      for(const id of this.seen.keys())if(!ids.has(id))this.seen.delete(id);
      for(const [id,event] of this.finished)if(!ids.has(id)||at-event.at>120000)this.finished.delete(id);
      for(const item of [...data.threads,...data.captains]) {
        if(this.seen.get(item.id)==='working' && ['idle','waiting','failed'].includes(item.status))this.finished.set(item.id,{at,status:status(item)});
        if(item.status==='working')this.finished.delete(item.id);
        this.seen.set(item.id,item.status);
      }
      this.data=data;this.stale=false;this.error='';this.updated=at;
    }
    fail(error){this.stale=true;this.error=error.message||String(error);this.seen.clear();}
    rows(c,current,now=Date.now()){
      const all=[...this.data.threads,...this.data.captains];
      const matches=item=>(c.archive||status(item)!=='archived') && (c.project==='all'||item.projectId===(c.project==='current'?current:c.project)) && (c.status==='all'||(c.status==='unread'?item.hasUnreads===true:status(item)===c.status)) && (item.title+' '+(item.name||'')+' '+(item.code||'')).toLowerCase().includes(c.text.toLowerCase());
      const compare=c.sort==='name'?(a,b)=>(a.title||a.name||'').localeCompare(b.title||b.name||''):c.sort==='status'?(a,b)=>status(a).localeCompare(status(b)):(a,b)=>Date.parse(b.lastActivityAt||b.updatedAt||0)-Date.parse(a.lastActivityAt||a.updatedAt||0)||0;
      const sorted=all.filter(matches).sort(compare);
      if(c.mode==='activity')return sorted.filter(i=>c.sections.includes(i.isCaptain?'captains':'threads')).map(item=>({item,depth:0,finished:this.finished.has(item.id)&&now-this.finished.get(item.id).at<120000}));
      const result=[],filtering=Boolean(c.text||c.status!=='all');
      const groups=c.projectRoots?this.data.projects.filter(p=>c.project==='all'||p.id===(c.project==='current'?current:c.project)):[null];
      for(const group of groups){
        const base=group?1:0,rootId=group?'project:'+group.id:null;
        const belongs=item=>!group||item.projectId===group.id;
        const captains=all.filter(i=>i.isCaptain&&belongs(i)&&(c.archive||status(i)!=='archived')&&(matches(i)||sorted.some(t=>t.parentId===i.id))).sort(compare);
        const standalone=sorted.filter(i=>belongs(i)&&!i.isCaptain&&(!c.sections.includes('captains')||!captains.some(p=>p.id===i.parentId)));
        const loaded=sorted.filter(i=>belongs(i)&&c.sections.includes(i.isCaptain?'captains':'threads')).length;
        if(group){
          if(!loaded&&!captains.length)continue;
          const expanded=filtering||c.expanded.includes(rootId);
          result.push({item:{id:rootId,projectId:group.id,title:group.name,isProject:true},depth:0,expanded,children:true,count:loaded});
          if(!expanded)continue;
        }
        for(const section of c.sections){
          const items=section==='threads'?standalone:captains;
          if(items.length)result.push({section,count:items.length,depth:base});
          for(const item of items){
            const children=item.isCaptain&&c.sections.includes('threads')?sorted.filter(i=>!i.isCaptain&&i.parentId===item.id):[];
            const expanded=filtering&&children.length>0||c.expanded.includes(item.id);
            result.push({item,depth:base,parent:rootId,children:item.isCaptain,expanded,context:!matches(item),count:children.length,finished:this.finished.has(item.id)&&now-this.finished.get(item.id).at<120000});
            if(expanded)for(const child of children)result.push({item:child,depth:base+1,parent:item.id,finished:this.finished.has(child.id)&&now-this.finished.get(child.id).at<120000});
          }
        }
      }
      return result;
    }
  }
  const api={defaults,config,status,State};
  if(typeof module!=='undefined')module.exports=api;else root.WorkTree=api;
})(typeof window!=='undefined'?window:globalThis);
