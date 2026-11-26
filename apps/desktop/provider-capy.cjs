const {api} = require('./api.cjs');
const Workspace = require('./workspace.cjs');
const {Streams,identifier,cursor} = require('./stream.cjs');
const Shape = require('./provider-shapes.cjs');
const supported = {supported:true};
const unavailable = reason => ({supported:false,reason});
const capabilities = demo => ({
  send:supported, stream:supported, read:supported, hierarchy:supported, attachments:supported,
  models:demo ? unavailable('Use Connect live to load models. Demo choices stay offline.') : supported,
  create:demo ? unavailable('Demo mode never creates threads.') : supported,
  createModel:demo ? unavailable('Connect live to choose a creation model.') : supported,
  createCaptain:demo ? unavailable('Connect live to assign a Captain.') : supported,
  createMachineSize:demo ? unavailable('Connect live to choose a cloud size.') : supported,
  activityHistory:demo ? supported : unavailable('Historical activity is not available through this adapter.'),
  runtime:unavailable('The Capy public API does not expose the execution host or machine moves.'),
  modelState:{supported:true,semantics:'last-reported'},
  modelSelection:{supported:!demo,semantics:'next-message',reason:demo?'Connect live to choose a next-message model.':undefined},
  hierarchyKind:'captain-crew', delivery:demo?'local':'queue'
});

function capyProvider({key, mock, fixture, signal, transcriptSignal, emit, demoFetch, fetcher = (...args) => fetch(...args)}) {
  const streams = new Streams({emit,fetcher});
  const client = () => api(key,fetcher,signal());
  const data = () => mock ? fixture : client();
  return {
    id:'capy', name:mock?'Capy demo':'Capy', capabilities:capabilities(mock),
    workspace:async () => {
      const value=await (mock ? fixture.activity() : Workspace.workspace(client()));
      return {projects:value.projects.map(Shape.project),threads:value.threads.map(Shape.conversation),captains:value.captains.map(Shape.conversation),activity:value.activity};
    },
    projects:async () => Shape.page(await data().projects(),Shape.project),
    threads:async (...args) => Shape.page(await data().threads(...args),Shape.conversation),
    messages:async (...args) => Shape.page(await (mock ? fixture : api(key,fetcher,AbortSignal.any([signal(),transcriptSignal()]))).messages(...args),Shape.message),
    models:async () => {
      const value=await client().models();
      return {items:value.items.map(Shape.model),default:{modelId:value.default?.modelId??null}};
    },
    creationOptions:async () => {
      const current=client(), [projects,models,captains]=await Promise.all([current.projects(),current.models(),Workspace.pages(cursor=>current.captains(cursor))]);
      return {projects:projects.items.map(Shape.project),models:models.items.map(Shape.model),default:{modelId:models.default?.modelId??null},captains:captains.filter(c=>!c.archived&&c.status!=='archived'&&projects.items.some(p=>p.id===c.projectId)).map(c=>({id:c.id,projectId:c.projectId,name:c.name||c.title||c.id}))};
    },
    create:async input => {
      const current=client(), [projects,models,captains]=await Promise.all([current.projects(),current.models(),input?.captainId?Workspace.pages(cursor=>current.captains(cursor)):Promise.resolve([])]);
      return Shape.conversation(await current.create(Workspace.selection(input,projects.items,models.items,captains)));
    },
    send:async (...args) => {
      if(!identifier(args[0]))throw Error('Invalid conversation ID.');
      const receipt=await data().send(...args);
      if(!receipt || typeof receipt.id!=='string' || !/^[A-Za-z0-9]{26}$/.test(receipt.id) || typeof receipt.deduped!=='boolean')throw Error('Invalid send receipt. Delivery is uncertain; retry with the same message ID.');
      return {id:receipt.id,deduped:receipt.deduped,delivery:mock?'local':'queue',accepted:true};
    },
    metadata:async id => {
      if(!identifier(id))throw Error('Invalid conversation ID.');
      const item=mock?{id}:await client().thread(id);
      if(item.id!==id)throw Error('Conversation changed.');
      return {id,lastModelId:typeof item.lastModelId==='string'?item.lastModelId:null};
    },
    readState:async id => {
      if(!identifier(id))throw Error('Invalid conversation ID.');
      const item=mock?{id,hasUnreads:false}:await client().thread(id);
      return {id:item.id,hasUnreads:item.hasUnreads};
    },
    receipt:async (id,action,eventId) => {
      if(!identifier(id)||!['read','unread'].includes(action)||action==='read'&&!cursor(eventId))throw Error('Invalid read receipt.');
      const item=mock?{id,hasUnreads:action==='unread'}:await client().receipt(id,action,eventId);
      return {id:item.id,hasUnreads:item.hasUnreads};
    },
    context:async (kind,id) => {
      if(!['thread','captain'].includes(kind)||typeof id!=='string'||!/^jam_[A-Za-z0-9]{26}$/.test(id))throw Error('Unsupported reference identity.');
      if(mock)throw Error('Reference is not in the demo workspace.');
      const current=api(key,fetcher,AbortSignal.any([signal(),transcriptSignal()]));
      const item=await (kind==='captain'?current.captain(id):current.thread(id));
      if(item.id!==id)throw Error('Reference destination changed.');
      return Shape.conversation({...item,isCaptain:kind==='captain'});
    },
    attachment:(id,fileId,loadSignal) => api(key,fetcher,AbortSignal.any([signal(),loadSignal])).attachment(id,fileId),
    stream:input => streams.start({...input,scope:Workspace.scope(key,mock),key,mock,demoFetch}),
    ack:(...args) => streams.ack(...args), stop:() => streams.stop()
  };
}
const validateKey = candidate => api(candidate).projects();
module.exports = {capyProvider,validateKey};
