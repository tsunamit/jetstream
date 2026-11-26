(function(root){
  const NS='http://www.w3.org/2000/svg',hosts=new Map(),motion=matchMedia('(prefers-reduced-motion: reduce)');
  const svg=document.createElementNS(NS,'svg'),symbol=document.createElementNS(NS,'symbol'),path=document.createElementNS(NS,'path');
  svg.setAttribute('aria-hidden','true');svg.classList.add('cube-defs');
  symbol.id='cube-working-frame';symbol.setAttribute('viewBox','0 0 64 64');path.setAttribute('fill','currentColor');symbol.append(path);svg.append(symbol);document.body.append(svg);
  let handle=0,last=0,frames=0,staticPainted=false;const origin=performance.now();
  const stats={frames:()=>frames,hosts:()=>hosts.size,running:()=>!!handle};
  function paint(time){path.setAttribute('d',CubeMath.render(time,900).path);staticPainted=time===0;frames++;}
  function prune(){for(const [host,record] of hosts)if(host.isConnected)record.connected=true;else if(record.connected){observer.unobserve(host);hosts.delete(host);}}
  function eligible(){
    if(document.hidden||motion.matches||!navigator.onLine)return false;
    for(const record of hosts.values())if(record.visible)return true;
    return false;
  }
  function tick(time){handle=0;prune();if(!eligible()){if(motion.matches&&!staticPainted)paint(0);return;}if(time-last>=1000/24){paint(time-origin);last=time;}handle=requestAnimationFrame(tick);}
  function reconcile(){prune();if(eligible()){if(!handle)handle=requestAnimationFrame(tick);}else{if(handle)cancelAnimationFrame(handle);handle=0;if(motion.matches&&!staticPainted)paint(0);}}
  const observer=new IntersectionObserver(entries=>{for(const e of entries){const record=hosts.get(e.target);if(record)record.visible=e.isIntersecting;}reconcile();});
  function mount(host){
    if(hosts.has(host))return;
    const node=document.createElementNS(NS,'svg'),use=document.createElementNS(NS,'use');node.setAttribute('viewBox','0 0 64 64');node.setAttribute('aria-hidden','true');use.setAttribute('href','#cube-working-frame');node.append(use);host.replaceChildren(node);hosts.set(host,{visible:false,connected:host.isConnected});observer.observe(host);queueMicrotask(()=>{if(!host.isConnected)unmount(host);else reconcile();});reconcile();
  }
  function unmount(host){observer.unobserve(host);hosts.delete(host);host.replaceChildren();reconcile();}
  new MutationObserver(reconcile).observe(document.body,{childList:true,subtree:true});
  motion.addEventListener('change',reconcile);document.addEventListener('visibilitychange',reconcile);window.addEventListener('offline',reconcile);window.addEventListener('online',reconcile);paint(0);
  root.CubeIndicator={mount,unmount,stats};
})(globalThis);
