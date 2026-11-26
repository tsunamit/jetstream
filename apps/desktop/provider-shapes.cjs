const pick = (value, keys) => Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
function conversation(value) {
  const item=pick(value,['id','projectId','title','name','code','archived','hasUnreads','needsYou','owed','queuedAt','createdAt','updatedAt','lastActivityAt','lastModelId','parentId','isCaptain','activityMinutes']);
  item.status=['working','waiting','idle','failed','archived'].includes(value.status)?value.status:'unknown';
  if(!item.parentId && value.captain?.jamId)item.parentId=value.captain.jamId;
  if(value.ask)item.ask=pick(value.ask,['key','text']);
  return item;
}
function message(value) {
  const item=pick(value,['id','source','text','createdAt','callId','clientKey','tool','model','authorName']);
  if(value.sender)item.sender=pick(value.sender,['id','relation']);
  if(Array.isArray(value.attachments))item.attachments=value.attachments.map(a=>({title:a.title,file:pick(a.file||{},['fileId','name','mediaType','sizeBytes','sourcePath'])}));
  if(Array.isArray(value.references))item.references=value.references.map(r=>pick(r,['location','path','version','fileId','title']));
  return item;
}
const page = (value, normalize) => ({items:value.items.map(normalize),...(value.cursor!==undefined?{cursor:value.cursor}:{}),...(value.beforeCursor!==undefined?{beforeCursor:value.beforeCursor}:{})});
const project = value => pick(value,['id','name','code']);
const model = value => ({...pick(value,['id','name','billing','fast','pro','ultrafast']),reasoningModes:Array.isArray(value.reasoningModes)?value.reasoningModes:[]});
module.exports={conversation,message,page,project,model};
