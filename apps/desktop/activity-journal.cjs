const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {TurnObserver}=require('./activity-state.js');
const DAYS=30,LIMIT=500,RETENTION=DAYS*86400000;
const opaque=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const key=event=>JSON.stringify([event.kind,event.threadId,event.kind==='sent'?event.receiptId:event.kind==='settled'?event.id:event.eventId]);
function clean(value){
  if(!value||!opaque(value.threadId)||!Number.isSafeInteger(value.at)||value.at<0)throw Error('Invalid activity metadata.');
  const event={kind:value.kind,threadId:value.threadId,at:value.at};
  if(value.kind==='sent'&&opaque(value.clientKey)&&opaque(value.receiptId))return {...event,clientKey:value.clientKey,receiptId:value.receiptId};
  if(value.kind==='settled'&&opaque(value.id)&&opaque(value.cursor))return {...event,id:value.id,cursor:value.cursor};
  if(value.kind==='read'&&opaque(value.eventId)&&Number.isSafeInteger(value.started)&&value.started>=0&&value.started<=value.at)return {...event,eventId:value.eventId,started:value.started};
  throw Error('Invalid activity metadata.');
}
class ActivityJournal{
  constructor(directory,{now=Date.now,io=fs}={}){this.directory=directory;this.now=now;this.io=io;this.scopes=new Map();this.queue=Promise.resolve();this.observers=new Map();}
  file(scope){if(!/^[a-f0-9]{24}$/.test(scope))throw Error('Invalid activity scope.');return path.join(this.directory,'activity-'+scope+'.json');}
  prune(events,clearedAt=0){
    const now=this.now(),unique=new Map();
    for(const value of events){const event=clean(value);if(event.at<now-RETENTION||event.at>now||event.at<clearedAt)continue;const id=key(event);if(!unique.has(id)||event.at<unique.get(id).at)unique.set(id,event);}
    return [...unique.values()].sort((a,b)=>a.at-b.at||key(a).localeCompare(key(b))).slice(-LIMIT);
  }
  async load(scope){
    const file=this.file(scope);if(this.scopes.has(scope))return this.scopes.get(scope);
    let state={events:[],clearedAt:0,warning:''};
    try{
      if((await this.io.stat(file)).size>1048576)throw Error('Activity metadata is too large.');
      const value=JSON.parse(await this.io.readFile(file,'utf8'));
      if(value.version!==1||!Array.isArray(value.events)||value.events.length>LIMIT||!Number.isSafeInteger(value.clearedAt)||value.clearedAt<0)throw Error('Invalid activity journal.');
      state={events:this.prune(value.events,value.clearedAt),clearedAt:value.clearedAt,warning:''};
    }catch(error){if(error.code!=='ENOENT')state.warning='Local activity could not be loaded; this session starts without it.';}
    this.scopes.set(scope,state);return state;
  }
  enqueue(work){const promise=this.queue.catch(()=>{}).then(work);this.queue=promise.catch(()=>{});return promise;}
  async save(scope,state){
    const file=this.file(scope),temporary=file+'.'+randomUUID()+'.tmp';
    try{
      await this.io.mkdir(this.directory,{recursive:true});
      await this.io.writeFile(temporary,JSON.stringify({version:1,clearedAt:state.clearedAt,events:state.events}),{mode:0o600,flag:'wx'});
      await this.io.rename(temporary,file);state.warning='';
    }catch{state.warning='Local activity is session-only; it could not be saved.';}
    finally{await this.io.rm(temporary,{force:true}).catch(()=>{});}
  }
  async record(scope,value){
    return this.enqueue(async()=>{
      const state=await this.load(scope),event=clean(value);state.events=this.prune(state.events,state.clearedAt);
      const prior=state.events.find(item=>key(item)===key(event));if(prior)return prior;
      state.events=this.prune([...state.events,event],state.clearedAt);await this.save(scope,state);return event;
    });
  }
  sent(scope,threadId,clientKey,receiptId){return this.record(scope,{kind:'sent',threadId,clientKey,receiptId,at:this.now()});}
  read(scope,threadId,eventId,started){return this.record(scope,{kind:'read',threadId,eventId,started,at:this.now()});}
  observe(scope,batch){
    this.file(scope);
    let observer=this.observers.get(scope);
    if(!observer||observer.token!==batch.token){observer={token:batch.token,turns:new TurnObserver()};this.observers.set(scope,observer);}
    for(const frame of batch.events){
      const settled=observer.turns.frame(batch.id,frame,this.now());if(!settled)continue;
      this.enqueue(async()=>{
        const state=await this.load(scope),created=Date.parse(settled.createdAt||'');
        if(state.clearedAt&&(!Number.isFinite(created)||created<=state.clearedAt)||Number.isFinite(created)&&created<this.now()-RETENTION)return;
        const event=clean({kind:'settled',threadId:batch.id,...settled});
        state.events=this.prune(state.events,state.clearedAt);
        if(state.events.some(item=>key(item)===key(event)))return;
        state.events=this.prune([...state.events,event],state.clearedAt);await this.save(scope,state);
      });
    }
  }
  snapshot(scope){return this.enqueue(async()=>{const state=await this.load(scope);state.events=this.prune(state.events,state.clearedAt);return {scope,events:state.events.map(item=>({...item})),clearedAt:state.clearedAt,warning:state.warning,limit:LIMIT,days:DAYS};});}
  clear(scope){return this.enqueue(async()=>{const state=await this.load(scope);state.events=[];state.clearedAt=this.now();this.observers.delete(scope);await this.save(scope,state);return {scope,events:[],clearedAt:state.clearedAt,warning:state.warning,limit:LIMIT,days:DAYS};});}
  stop(){this.observers.clear();}
}
module.exports={ActivityJournal,LIMIT,DAYS,clean};
