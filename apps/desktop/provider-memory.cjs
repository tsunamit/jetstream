const yes = {supported:true};
const no = reason => ({supported:false,reason});
function memoryProvider({emit}) {
  const projects=[{id:'p1',name:'Memory workspace'}];
  const threads=[{id:'t1',projectId:'p1',title:'A different provider',status:'idle',hasUnreads:true},{id:'t2',projectId:'p1',title:'Another conversation',status:'idle',hasUnreads:false}];
  const content=new Map(threads.map(t=>[t.id,[{id:'message/initial',source:'assistant',text:'In-memory provider content. No Capy API.',createdAt:'2026-11-25T00:00:00Z'}]]));
  const sends=new Map();
  let active=null, sequence=0, inFlight=null, queued=[];
  const flush=()=>{
    if(!active || inFlight || !queued.length)return;
    const events=queued;queued=[];inFlight=++sequence;
    emit({...active,sequence:inFlight,events});
  };
  const publish=events=>{queued.push(...events);flush();};
  return {
    id:'memory',name:'In-memory test provider',
    capabilities:{send:yes,stream:yes,read:yes,models:yes,create:no('This provider cannot create conversations.'),activityHistory:no('This provider does not expose historical activity.'),hierarchy:no('This provider has no captain or crew hierarchy.'),attachments:no('This provider has no attachments.'),runtime:no('This provider does not report an execution host.'),modelState:{supported:false,reason:'Actual model is not reported.'},modelSelection:{supported:true,semantics:'next-message'},delivery:'local'},
    workspace:()=>({projects,threads,captains:[],activity:[]}),projects:()=>({items:projects}),
    threads:project=>({items:threads.filter(t=>t.projectId===project),cursor:null}),
    messages:id=>({items:[...(content.get(id)||[])],cursor:null,beforeCursor:null}),
    models:()=>({items:[{id:'memory/model',name:'Memory model',billing:'offline',reasoningModes:[],fast:false,pro:false,ultrafast:false}],default:{modelId:'memory/model'}}),
    metadata:id=>({id,lastModelId:null}),
    readState:id=>({id,hasUnreads:threads.find(t=>t.id===id)?.hasUnreads===true}),
    receipt:(id,action,eventId)=>{
      if(action==='read' && !eventId.startsWith('cursor:'))throw Error('Invalid memory cursor.');
      const item=threads.find(t=>t.id===id);if(!item)throw Error('Conversation unavailable.');
      item.hasUnreads=action==='unread';return {id,hasUnreads:item.hasUnreads};
    },
    send:(id,text,clientKey,model)=>{
      if(sends.has(clientKey))return {...sends.get(clientKey),deduped:true};
      const items=content.get(id);if(!items)throw Error('Conversation unavailable.');
      const item={id:'message/'+(sends.size+1),source:'user',text,clientKey,createdAt:new Date().toISOString(),...(model?{model:model.modelId}:{})};
      items.push(item);
      const receipt={id:item.id,deduped:false,accepted:true,delivery:'local'};sends.set(clientKey,receipt);
      if(active?.id===id)publish([{event:'transcript',id:'cursor:'+item.id,data:item}]);
      return receipt;
    },
    stream:input=>{
      active={id:input.id,token:input.token};sequence=0;inFlight=null;queued=[];
      publish([{event:'connection',data:{state:'streaming'}},...content.get(input.id).map(item=>({event:'transcript',id:'cursor:'+item.id,data:item}))]);
    },
    ack:(token,value)=>{if(active?.token===token && value===inFlight){inFlight=null;flush();}},
    stop:()=>{active=null;queued=[];inFlight=null;}
  };
}
module.exports={memoryProvider};
