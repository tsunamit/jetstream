(function(root) {
  const SIZE=64, DISTANCE=8, SCALE=10.5, HALF=.47, RADIUS=.31;
  const sequence=[{axis:1,layer:1,sign:1},{axis:0,layer:1,sign:1},{axis:1,layer:1,sign:-1},{axis:0,layer:1,sign:-1},{axis:0,layer:1,sign:1},{axis:1,layer:1,sign:1},{axis:0,layer:1,sign:-1},{axis:1,layer:1,sign:-1}];
  const add=(a,b)=>a.map((v,i)=>v+b[i]);
  const mul=(a,k)=>a.map(v=>v*k);
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  function rotate(p,axis,angle) {
    const q=[...p],i=(axis+1)%3,j=(axis+2)%3,c=Math.cos(angle),s=Math.sin(angle);
    q[i]=c*p[i]-s*p[j];q[j]=s*p[i]+c*p[j];return q;
  }
  const camera=p=>rotate(rotate(p,1,-.43),0,.32);
  function project(p) {
    const q=camera(p),depth=DISTANCE-q[2],factor=DISTANCE/depth;
    return {x:SIZE/2+SCALE*q[0]*factor,y:SIZE/2-SCALE*q[1]*factor,z:1/depth};
  }
  function initial() {
    const result=[];
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      const p=[x,y,z];result.push({id:result.length,p,axes:[[1,0,0],[0,1,0],[0,0,1]],stickers:[0,1,2].flatMap(axis=>[-1,1].map(sign=>p[axis]===sign))});
    }
    return result;
  }
  function commit(state,turn) {
    const snap=p=>rotate(p,turn.axis,turn.sign*Math.PI/2).map(v=>Math.round(v)||0);
    return state.map(c=>c.p[turn.axis]===turn.layer?{...c,p:snap(c.p),axes:c.axes.map(snap)}:c);
  }
  const states=[initial()];for(const turn of sequence)states.push(commit(states.at(-1),turn));
  function pose(state,turn,angle) {
    return state.map(c=>c.p[turn.axis]===turn.layer?{...c,p:rotate(c.p,turn.axis,angle),axes:c.axes.map(v=>rotate(v,turn.axis,angle))}:c);
  }
  function frame(time,duration=1600) {
    const total=duration*sequence.length,t=((time%total)+total)%total,index=Math.floor(t/duration),phase=t/duration-index;
    const progress=Math.max(0,Math.min(1,(phase-.1)/.8)),ease=progress*progress*(3-2*progress),angle=sequence[index].sign*Math.PI/2*ease;
    return {cubies:progress>=1-1e-12?states[index+1]:pose(states[index],sequence[index],angle),turn:sequence[index],index,phase,angle,total};
  }
  function triangles(cubies,stickers=true) {
    const result=[],dots=[];
    for(const c of cubies)for(let axis=0;axis<3;axis++)for(let side=0;side<2;side++){
      const sign=side?1:-1,normal=mul(c.axes[axis],sign),center=add(c.p,mul(normal,HALF)),n=camera(normal),q=camera(center);
      if(dot(n,[-q[0],-q[1],DISTANCE-q[2]])<=0)continue;
      const u=c.axes[(axis+1)%3],v=c.axes[(axis+2)%3];
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>project(add(center,add(mul(u,a*HALF),mul(v,b*HALF)))));
      result.push({p:[corners[0],corners[1],corners[2]],ink:0,owner:c.id},{p:[corners[0],corners[2],corners[3]],ink:0,owner:c.id});
      if(!stickers||!c.stickers[axis*2+side])continue;
      const lifted=add(center,mul(normal,.002)),middle=project(lifted),ring=Array.from({length:20},(_,i)=>{const a=i*Math.PI/10;return project(add(lifted,add(mul(u,Math.cos(a)*RADIUS),mul(v,Math.sin(a)*RADIUS))));});
      dots.push({id:c.id+':'+axis+':'+side,world:lifted,screen:middle,normal});
      for(let i=0;i<ring.length;i++)result.push({p:[middle,ring[i],ring[(i+1)%ring.length]],ink:1,owner:c.id});
    }
    return {triangles:result,dots};
  }
  function raster(input,reverse=false) {
    const depth=new Float64Array(SIZE*SIZE),ink=new Uint8Array(SIZE*SIZE),owners=new Int16Array(SIZE*SIZE).fill(-1);
    const ordered=[...input].sort((a,b)=>a.p.reduce((s,p)=>s+p.z,0)-b.p.reduce((s,p)=>s+p.z,0));if(reverse)ordered.reverse();
    for(const {p:[a,b,c],ink:value,owner=-1} of ordered){
      const area=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(area)<1e-10)continue;
      const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),maxX=Math.min(SIZE-1,Math.ceil(Math.max(a.x,b.x,c.x)));
      const minY=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),maxY=Math.min(SIZE-1,Math.ceil(Math.max(a.y,b.y,c.y)));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const px=x+.5,py=y+.5,wa=((b.y-c.y)*(px-c.x)+(c.x-b.x)*(py-c.y))/area,wb=((c.y-a.y)*(px-c.x)+(a.x-c.x)*(py-c.y))/area,wc=1-wa-wb;
        if(wa<0||wb<0||wc<0)continue;
        const z=wa*a.z+wb*b.z+wc*c.z,index=y*SIZE+x;
        if(z>depth[index]){depth[index]=z;ink[index]=value;owners[index]=owner;}
      }
    }
    let path='',count=0,bounds={left:SIZE,top:SIZE,right:0,bottom:0};
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;){
      if(!ink[y*SIZE+x]){x++;continue;}
      const start=x;while(x<SIZE&&ink[y*SIZE+x]){x++;count++;}
      path+='M'+start+' '+y+'h'+(x-start)+'v1h'+(start-x)+'z';
      bounds.left=Math.min(bounds.left,start);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=y+1;
    }
    return {path,ink,depth,count,bounds,owners};
  }
  function render(time,duration=1600) {
    const state=frame(time,duration),hidden=raster(triangles(state.cubies,false).triangles),dots=[];
    const radius=2.5,bounds={left:SIZE,top:SIZE,right:0,bottom:0};
    for(const c of state.cubies){
      if(!c.stickers.some(Boolean))continue;
      const point=project(c.p),index=Math.floor(point.y)*SIZE+Math.floor(point.x);
      if(hidden.owners[index]!==c.id)continue;
      const x=Number((SIZE/2+(point.x-SIZE/2)*1.4).toFixed(2)),y=Number((SIZE/2+(point.y-SIZE/2)*1.4).toFixed(2));
      dots.push({id:c.id,x,y,r:radius,world:c.p});
      bounds.left=Math.min(bounds.left,x-radius);bounds.right=Math.max(bounds.right,x+radius);bounds.top=Math.min(bounds.top,y-radius);bounds.bottom=Math.max(bounds.bottom,y+radius);
    }
    const path=dots.map(d=>'M'+(d.x-radius).toFixed(2)+' '+d.y.toFixed(2)+'a'+radius+' '+radius+' 0 1 0 '+(2*radius)+' 0a'+radius+' '+radius+' 0 1 0 '+(-2*radius)+' 0Z').join('');
    return {path,count:dots.length,bounds,index:state.index,phase:state.phase,angle:state.angle,turn:state.turn,dots};
  }
  const api={sequence,states,initial,commit,pose,project,frame,triangles,raster,render};
  if(typeof module!=='undefined')module.exports=api;else root.CubeMath=api;
})(globalThis);
