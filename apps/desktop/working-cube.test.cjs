const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./working-cube.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,a+' != '+b);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
test('quarter-turn matrices are proper rotations and four turns restore all positions/orientations',()=>{
  for(let axis=0;axis<3;axis++)for(const layer of [-1,0,1]){
    const turn={axis,layer,sign:1},original=M.initial();let state=original;
    for(let n=0;n<4;n++){
      state=M.commit(state,turn);assert.equal(new Set(state.map(c=>c.p.join(','))).size,27);
      assert.equal(state.filter(c=>c.p[axis]===layer).length,9);
      for(const c of state){assert.ok(c.p.every(v=>[-1,0,1].includes(v)));for(const a of c.axes)near(Math.hypot(...a),1);near(dot(cross(c.axes[0],c.axes[1]),c.axes[2]),1);}
    }
    assert.deepEqual(state,original);
  }
});
test('each in-flight slice is rigid, leaves other layers fixed and preserves camera/center',()=>{
  const initial=M.initial(),turn=M.sequence[0],moving=initial.filter(c=>c.p[turn.axis]===turn.layer);
  for(let n=0;n<=16;n++){
    const state=M.pose(initial,turn,n*Math.PI/32);
    for(const c of initial.filter(c=>c.p[turn.axis]!==turn.layer))assert.deepEqual(state[c.id],c);
    for(const a of moving)for(const b of moving)near(distance(state[a.id].p,state[b.id].p),distance(a.p,b.p));
    for(const c of state){near(Math.hypot(...c.axes[0]),1);near(dot(c.axes[0],c.axes[1]),0);}
  }
  const center=M.project([0,0,0]);near(center.x,32);near(center.y,32);near(center.z,1/8);
});
test('every turn snaps its permutation before the next segment; the eight-turn period resets continuously',()=>{
  assert.deepEqual(M.states.at(-1),M.initial());
  for(let i=0;i<8;i++){
    assert.deepEqual(M.frame((i+.95)*1600).cubies,M.states[i+1]);
    assert.equal(M.render((i+.95)*1600).path,M.render((i+1)*1600).path);
  }
  assert.equal(M.render(0).path,M.render(12800).path);assert.equal(M.render(12800-.01).path,M.render(0).path);
});
test('perspective depth crossing and opaque occlusion are independent of triangle painting order',()=>{
  const state=M.initial(),turn=M.sequence[0],a=M.triangles(M.pose(state,turn,0)),b=M.triangles(M.pose(state,turn,Math.PI/2));
  const pairs=[];
  for(const x of a.dots)for(const y of a.dots){const bx=b.dots.find(d=>d.id===x.id),by=b.dots.find(d=>d.id===y.id);if(bx&&by&&(x.screen.z-y.screen.z)*(bx.screen.z-by.screen.z)<-1e-7)pairs.push([x.id,y.id]);}
  assert.ok(pairs.length>0,'Rotating dot centers must cross in depth');
  let hidden=0;
  for(let i=0;i<=20;i++){
    const geometry=M.triangles(M.frame(160+i*64).cubies),forward=M.raster(geometry.triangles),reverse=M.raster(geometry.triangles,true);
    assert.deepEqual(forward.ink,reverse.ink);
    const unoccluded=M.raster(geometry.triangles.filter(t=>t.ink));hidden+=unoccluded.count-forward.count;
  }
  assert.ok(hidden>0,'Opaque cube faces must hide rear sticker pixels');
});
test('all turn samples keep the 16px footprint, bounded spacing, margin and monochrome path',()=>{
  for(let i=0;i<256;i++){
    const image=M.render(i*50);assert.ok(image.count>=7&&image.count<=9);assert.ok(image.bounds.left>=2&&image.bounds.top>=2&&image.bounds.right<=62&&image.bounds.bottom<=62);
    for(const tri of M.triangles(M.frame(i*50).cubies).triangles)for(const p of tri.p)assert.ok(p.x>1&&p.y>1&&p.x<63&&p.y<63);
  }
});
test('visible glyph contains only sparse little round dots at the moving lattice centers',()=>{
  for(let i=0;i<256;i++){
    const time=i*50,image=M.render(time),state=M.frame(time);
    assert.equal((image.path.match(/M/g)||[]).length,image.count);assert.equal((image.path.match(/a/g)||[]).length,image.count*2);assert.ok([...image.path.matchAll(/[A-Za-z]/g)].every(match=>['M','a','Z'].includes(match[0])));
    assert.equal(new Set(image.dots.map(d=>d.id)).size,image.count);
    for(const d of image.dots){
      assert.equal(d.r,2.5);assert.notEqual(d.id,13);assert.deepEqual(d.world,state.cubies.find(c=>c.id===d.id).p);
      const p=M.project(d.world);near(d.x,Number((32+(p.x-32)*1.4).toFixed(2)));near(d.y,Number((32+(p.y-32)*1.4).toFixed(2)));
      for(const other of image.dots)if(other!==d)assert.ok(Math.hypot(d.x-other.x,d.y-other.y)>d.r+other.r+1);
    }
  }
});
test('hidden cube bodies cull rear dots but never become visible material',()=>{
  for(let i=0;i<=20;i++){
    const time=160+i*64,state=M.frame(time),geometry=M.triangles(state.cubies,false),hidden=M.raster(geometry.triangles),image=M.render(time);
    assert.ok(geometry.triangles.every(t=>t.ink===0));assert.equal(hidden.path,'');assert.equal(hidden.count,0);assert.deepEqual(hidden.owners,M.raster(geometry.triangles,true).owners);
    assert.ok(image.count<state.cubies.filter(c=>c.stickers.some(Boolean)).length);
    for(const d of image.dots){const p=M.project(d.world);assert.equal(hidden.owners[Math.floor(p.y)*64+Math.floor(p.x)],d.id);}
  }
});
