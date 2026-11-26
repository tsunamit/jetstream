const {createHash} = require('node:crypto');
const sizes = ['small','medium','large','ultra','hyper','bigguy'];
function scope(key, demo) { return demo ? 'demo' : createHash('sha256').update(key).digest('hex').slice(0,24); }
async function pages(load) {
  const items = new Map(), seen = new Set();
  let cursor;
  for (let page = 0; page < 200; page++) {
    const result = await load(cursor);
    if (!Array.isArray(result.items)) throw Error('Invalid API page. Last-known data retained.');
    for (const item of result.items) items.set(item.id,item);
    cursor = result.cursor;
    if (!cursor) return [...items.values()];
    if (seen.has(cursor)) throw Error('Repeated API cursor. Last-known data retained.');
    seen.add(cursor);
  }
  throw Error('Workspace exceeds 200 pages per collection. Refresh stopped; no partial data substituted.');
}
async function workspace(client) {
  const deadline=Date.now()+30000;
  const checked=load=>{if(Date.now()>deadline)throw Error('Workspace refresh exceeded 30s. Last-known complete snapshot retained; retry manually.');return load();};
  const {items:projects} = await client.projects();
  const captains = (await pages(cursor=>checked(()=>client.captains(cursor)))).map(item=>({...item,isCaptain:true}));
  const threads = new Map();
  for (const project of projects) for (const item of await pages(cursor=>checked(()=>client.threads(project.id,cursor)))) threads.set(item.id,{...item,parentId:item.captain?.jamId});
  for (const item of captains) threads.delete(item.id);
  return {projects,captains,threads:[...threads.values()],activity:[]};
}
function selection(input, projects, models) {
  if (!input || Object.keys(input).some(k=>!['requestId','projectId','message','model','machineSize'].includes(k))) throw Error('Unsupported creation option. Device discovery is not available in the public API.');
  if (typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.requestId)) throw Error('Invalid request ID.');
  if (!projects.some(p=>p.id===input.projectId)) throw Error('Project is no longer available.');
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.length>30000) throw Error('Initial prompt must be 1–30000 characters.');
  const body={requestId:input.requestId,projectId:input.projectId,message:input.message.trim()};
  if (input.machineSize) {
    if (!sizes.includes(input.machineSize)) throw Error('Unsupported cloud size.');
    body.machineSize=input.machineSize;
  }
  if (input.model) {
    const model = models.find(m=>m.id===input.model.modelId);
    if (!model || Object.keys(input.model).some(k=>!['modelId','reasoningMode','modes'].includes(k))) throw Error('Model is no longer available.');
    const {reasoningMode,modes} = input.model;
    if (reasoningMode && !model.reasoningModes.includes(reasoningMode)) throw Error('Unsupported reasoning strength for this model.');
    if (modes && (typeof modes!=='object' || Array.isArray(modes) || Object.entries(modes).some(([k,v])=>!['fast','pro','ultrafast'].includes(k) || typeof v!=='boolean' || v && !model[k]))) throw Error('Unsupported model mode.');
    body.model={modelId:model.id,...(reasoningMode?{reasoningMode}:{}),...(modes?{modes}: {})};
  }
  return body;
}
module.exports={scope,pages,workspace,selection,sizes};
