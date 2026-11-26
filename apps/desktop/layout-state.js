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
  function gutter(width,centered){
    const base=clamp(8+(width-300)*.04,8,24);
    return Math.round((base+(centered?clamp((width-800)*.07,0,56):0))*100)/100;
  }
  function replySize(preferred,natural,height,b,manual=false){
    const baseline=clamp(preferred,b.replyMin,b.replyMax),cap=Math.max(baseline,Math.min(b.replyMax,Math.floor(height*.45)));
    return {height:manual?baseline:Math.round(clamp(natural,baseline,cap)),min:manual?b.replyMin:Math.round(clamp(natural,b.replyMin,Math.min(b.replyMax,Math.max(b.replyMin,Math.floor(height*.45)))))};
  }
  const api={defaults,config,bounds,clamp,gutter,replySize};
  if(typeof module!=='undefined')module.exports=api;else root.LayoutState=api;
})(typeof window!=='undefined'?window:globalThis);
