(function(root){
  function selection(value, models) {
    if(value==null)return undefined;
    if(typeof value!=='object'||Array.isArray(value)||typeof value.modelId!=='string')throw Error('Invalid model selection.');
    const model=models.find(m=>m.id===value.modelId);
    if(!model)throw Error('Selected model is no longer available. Reload models and choose again.');
    if(Object.keys(value).some(k=>!['modelId','reasoningMode','modes'].includes(k)))throw Error('Invalid model selection.');
    if(value.reasoningMode!==undefined&&!model.reasoningModes.includes(value.reasoningMode))throw Error('Reasoning strength is unavailable for this model.');
    if(value.modes!==undefined&&(!value.modes||typeof value.modes!=='object'||Array.isArray(value.modes)||Object.entries(value.modes).some(([k,v])=>!['fast','pro','ultrafast'].includes(k)||typeof v!=='boolean'||!model[k])))throw Error('Selected mode is unavailable for this model.');
    return {modelId:model.id,...(value.reasoningMode?{reasoningMode:value.reasoningMode}:{}),...(value.modes?{modes:{...value.modes}}:{})};
  }
  function runtime(){return 'Agent host: unknown (API)';}
  const api={selection,runtime};
  if(typeof module==='object')module.exports=api;else root.ConversationSettings=api;
})(globalThis);
