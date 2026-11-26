(function(root) {
  const steps = {Next:1, Previous:-1};
  const pages = {HalfDown:0.5, HalfUp:-0.5, PageDown:1, PageUp:-1};
  function rowTarget(rects, index, viewport, fraction) {
    if (!rects.length) return -1;
    index = Math.max(0,Math.min(rects.length-1,index));
    const y = Math.max(viewport.top,Math.min(viewport.bottom,rects[index].top)) + viewport.height*fraction;
    let next = index;
    for (let i=0;i<rects.length;i++) if (Math.abs(rects[i].top-y)<Math.abs(rects[next].top-y)) next=i;
    return next;
  }
  class Controller {
    constructor(adapter) {this.adapter=adapter;}
    get capabilities() {return Object.keys(this.adapter);}
    perform(action) {return this.adapter[action]?.();}
  }
  function list({rows,index,select,viewport,find,collapse,expand,inset=()=>0,visible=host=>host.getBoundingClientRect()}) {
    const choose = next => {const items=rows();if(items.length)select(Math.max(0,Math.min(items.length-1,next)),items);};
    const adapter = {First:()=>choose(0),Last:()=>choose(rows().length-1),Find:find};
    for (const [action,delta] of Object.entries(steps)) adapter[action]=()=>choose(index()<0 ? delta>0?0:rows().length-1 : index()+delta);
    for (const [action,fraction] of Object.entries(pages)) adapter[action]=()=>{
      const host=viewport(), items=rows(), bounds=visible(host), top=inset(host), height=Math.max(0,bounds.bottom-bounds.top-top);
      const next=rowTarget(items.map(row=>row.getBoundingClientRect()),index(),{top:bounds.top+top,bottom:bounds.bottom,height},fraction);
      if(next<0)return;
      host.scrollTop+=height*fraction;choose(next);
    };
    if(collapse)adapter.Collapse=collapse;
    if(expand)adapter.Expand=expand;
    return new Controller(adapter);
  }
  const api={Controller,list,rowTarget};
  if(typeof module!=='undefined')module.exports=api;else root.Navigation=api;
})(globalThis);
