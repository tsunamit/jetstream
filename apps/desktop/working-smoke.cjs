const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-working-'));let app;
  try{
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();await page.waitForFunction(()=>keyReady&&!navigating&&!messageBusy);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!CubeIndicator.stats.running());
    await page.evaluate(()=>{
      document.querySelectorAll('.work-indicator').forEach(node=>CubeIndicator.unmount(node));$('threads').replaceChildren();
      globalThis.fixtureRows=new Map();
      globalThis.fixtureRow=(id,item,fresh=true)=>{
        const li=document.createElement('li'),button=document.createElement('button'),meta=document.createElement('span'),name=document.createElement('span');
        button.className='tree-row thread-unread';button.dataset.id=id;button.setAttribute('aria-current',String(id==='fresh'));meta.className='thread-meta';meta.textContent=item.status;name.className='thread-name';name.textContent=id==='fresh'?'Checking the release package':id+' fixture';button.append(meta,name);li.append(button);
        const before=JSON.stringify(item);workIndicator(button,item,fresh);if(JSON.stringify(item)!==before)throw Error('Indicator mutated status/unread metadata');$('threads').append(li);fixtureRows.set(id,{li,button,item});return button;
      };
      fixtureRow('fresh',{status:'working',hasUnreads:true});fixtureRow('stale',{status:'working',hasUnreads:true},false);fixtureRow('idle',{status:'idle',hasUnreads:true});fixtureRow('archived',{status:'working',archived:true,hasUnreads:true});
      Object.defineProperty(navigator,'onLine',{configurable:true,value:false});fixtureRow('offline',{status:'working',hasUnreads:true});delete navigator.onLine;
    });
    await page.waitForFunction(()=>CubeIndicator.stats.hosts()===1);
    assert.equal(await page.locator('.work-indicator.working').count(),1);
    assert.equal(await page.locator('[data-id="fresh"] .work-indicator svg use').count(),1);
    for(const id of ['stale','archived','offline']){assert.equal(await page.locator('[data-id="'+id+'"] .work-indicator').innerText(),'◇');assert.match(await page.locator('[data-id="'+id+'"] .work-indicator').getAttribute('title'),/Last known/);}
    assert.equal(await page.locator('[data-id="idle"] .work-indicator').innerText(),'·');
    assert.equal(await page.locator('[data-id="fresh"] .work-indicator').getAttribute('aria-hidden'),'true');
    const native=await page.locator('[data-id="fresh"] .work-indicator').boundingBox();assert.equal(native.width,16);assert.equal(native.height,16);
    const circles=await page.evaluate(()=>{const image=CubeMath.render(1350,900);document.querySelector('#cube-working-frame path').setAttribute('d',image.path);return {commands:image.path.match(/[A-Za-z]/g),count:image.count,radii:image.dots.map(d=>d.r)};});
    assert.ok(circles.commands.every(command=>['M','a','Z'].includes(command)));assert.equal(circles.commands.filter(command=>command==='a').length,circles.count*2);assert.ok(circles.radii.every(radius=>radius===2.5));
    assert.equal(await page.locator('#cube-working-frame path').evaluate(n=>getComputedStyle(n).stroke),'none');await settle();await capture('working-3d.png');
    if(process.argv[2]){const png=await app.evaluate(async({BrowserWindow},rect)=>{const w=BrowserWindow.getAllWindows()[0],image=await w.capturePage(),factor=image.getSize().width/w.getContentSize()[0];return image.crop(Object.fromEntries(Object.entries(rect).map(([key,value])=>[key,Math.round(value*factor)]))).toPNG().toString('base64');},native);await fs.writeFile(path.join(process.argv[2],'dots-native.png'),Buffer.from(png,'base64'));}
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>CubeIndicator.stats.running());
    const start=await page.evaluate(()=>CubeIndicator.stats.frames());await page.waitForTimeout(220);assert.ok(await page.evaluate(()=>CubeIndicator.stats.frames())>start);
    await page.evaluate(()=>{for(let i=0;i<80;i++)fixtureRow('many-'+i,{status:'working',hasUnreads:false});});await page.waitForFunction(()=>CubeIndicator.stats.hosts()===81);
    const sample=await page.evaluate(async()=>{const start=performance.now(),frames=CubeIndicator.stats.frames();await new Promise(resolve=>setTimeout(resolve,220));return {elapsed:performance.now()-start,frames:CubeIndicator.stats.frames()-frames};});
    assert.ok(sample.frames>0&&sample.frames<=Math.ceil(sample.elapsed*24/1000)+1,'Instances share one capped frame clock: '+JSON.stringify(sample));assert.equal(await page.locator('#cube-working-frame path').count(),1);console.log('Shared clock sample',JSON.stringify(sample));
    await page.evaluate(()=>{for(const [id,row]of fixtureRows)if(id.startsWith('many-'))row.li.remove();});await page.waitForFunction(()=>CubeIndicator.stats.hosts()===1);
    await page.evaluate(()=>{fixtureRows.get('fresh').li.style.transform='translateY(2000px)';});await page.waitForFunction(()=>!CubeIndicator.stats.running());
    const offscreen=await page.evaluate(()=>CubeIndicator.stats.frames());await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>CubeIndicator.stats.frames()),offscreen);
    await page.evaluate(()=>{fixtureRows.get('fresh').li.style.transform='';});await page.waitForFunction(()=>CubeIndicator.stats.running());
    await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});await page.waitForFunction(()=>!CubeIndicator.stats.running());
    const offline=await page.evaluate(()=>CubeIndicator.stats.frames());await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>CubeIndicator.stats.frames()),offline);
    await page.evaluate(()=>{delete navigator.onLine;window.dispatchEvent(new Event('online'));});await page.waitForFunction(()=>CubeIndicator.stats.running());
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!CubeIndicator.stats.running()&&document.querySelector('#cube-working-frame path').getAttribute('d')===CubeMath.render(0,900).path);const reduced=await clockState();await page.waitForTimeout(150);assert.deepEqual(await clockState(),reduced);await capture('working-static.png');
    await page.evaluate(()=>{const {button,item}=fixtureRows.get('fresh');workIndicator(button,{...item,status:'idle'},true);});assert.equal(await page.locator('[data-id="fresh"] .work-indicator').innerText(),'·');assert.equal(await page.locator('[data-id="fresh"]').evaluate(n=>n.classList.contains('thread-unread')),true);assert.equal(await page.evaluate(()=>CubeIndicator.stats.hosts()),0);
    await page.emulateMedia({reducedMotion:'no-preference'});assert.equal(await page.evaluate(()=>CubeIndicator.stats.running()),false);
    await page.evaluate(()=>{const {button,item}=fixtureRows.get('fresh');workIndicator(button,item,true);});await page.waitForFunction(()=>CubeIndicator.stats.running());await page.evaluate(()=>fixtureRows.get('fresh').li.remove());await page.waitForFunction(()=>CubeIndicator.stats.hosts()===0&&!CubeIndicator.stats.running());
    await page.evaluate(()=>fixtureRow('zoom',{status:'working',hasUnreads:false}));
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!CubeIndicator.stats.running());
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(640,600));
    for(const zoom of [.5,1,2]){
      await app.evaluate(({BrowserWindow},zoom)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),zoom);await settle();
      const rect=await page.locator('[data-id="zoom"] .work-indicator').boundingBox();assert.equal(rect.width,16);assert.equal(rect.height,16);
      if(zoom===1){await page.locator('[data-id="zoom"]').scrollIntoViewIfNeeded();await settle();await capture('dots-minimum.png');}
      assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,w:document.documentElement.scrollWidth<=innerWidth,h:document.documentElement.scrollHeight<=innerHeight})),{x:0,y:0,w:true,h:true});
    }
    assert.deepEqual(errors,[]);console.log('PASS 3D working indicator: fresh/stale/offline/archived/settled parity, unread/aria preservation, shared 81-instance clock, removal/offscreen stop, reduced motion, 16px footprint and 50–200% minimum-window root bounds');
    async function clockState(){return page.evaluate(()=>({frames:CubeIndicator.stats.frames(),path:document.querySelector('#cube-working-frame path').getAttribute('d')}));}
    async function settle(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
    async function capture(name){if(!process.argv[2])return;await fs.mkdir(process.argv[2],{recursive:true});const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Visible test window');return(await w.capturePage()).toPNG().toString('base64');});await fs.writeFile(path.join(process.argv[2],name),Buffer.from(png,'base64'));}
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
