(function(root){
  const defaults=()=>({version:1,sidebarWidth:280,replyHeight:128,centeredReading:true});
  function config(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(defaults(),key)))throw Error('Invalid layout configuration.');
    const c={...defaults(),...value};
    if(c.version!==1||!Number.isInteger(c.sidebarWidth)||c.sidebarWidth<95||c.sidebarWidth>640||!Number.isInteger(c.replyHeight)||c.replyHeight<72||c.replyHeight>1200||typeof c.centeredReading!=='boolean')throw Error('Invalid layout sizes.');
    return c;
  }
  function bounds(width,height){
    const sidebarMin=Math.min(180,Math.max(95,Math.floor(width*.32)));
    const sidebarMax=Math.max(sidebarMin,Math.min(640,Math.floor(width-Math.min(240,width*.52)-6)));
    const replyMin=Math.min(100,Math.max(72,Math.floor(height*.35)));
    const replyMax=Math.max(replyMin,Math.min(1200,Math.floor(height-Math.min(160,height*.45)-6)));
    return {sidebarMin,sidebarMax,replyMin,replyMax};
  }
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const api={defaults,config,bounds,clamp};
  if(typeof module!=='undefined')module.exports=api;else root.LayoutState=api;
})(typeof window!=='undefined'?window:globalThis);
