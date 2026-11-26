const assert = require('node:assert/strict');
const test = require('node:test');
const {EventEmitter} = require('node:events');
const {download, rasterType, safeURL, saveName} = require('./media.cjs');
const {Previews} = require('./media.cjs');

test('automatic previews coalesce, cache, bound concurrency and attempts, and allow explicit retry', async () => {
  const previews = new Previews(), releases = [];
  const bytes = Buffer.from([137,80,78,71,13,10,26,10]);
  let calls=0;
  const load=()=>{calls++;return new Promise(resolve=>releases.push(()=>resolve(bytes)));};
  const a=previews.get('a',true,load),duplicate=previews.get('a',true,load),b=previews.get('b',true,load),c=previews.get('c',true,load);
  assert.equal(calls,2);assert.equal(a,duplicate);
  releases.shift()();await a;await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,3);
  while(releases.length)releases.shift()();await Promise.all([b,c]);
  await previews.get('a',true,()=>{throw Error('must cache');});
  for(let i=3;i<24;i++)await assert.rejects(previews.get('failure'+i,true,async()=>{throw Error('failed');}));
  await assert.rejects(previews.get('limit',true,load),/limit/);
  await previews.get('failure3',false,async()=>bytes);
  assert.ok(previews.bytes<=32*1024*1024);
});

test('navigation aborts/discards previews, connection reset clears cached file identities', async () => {
  const previews=new Previews(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);
  let release,signal;
  const pending=previews.get('old',true,async value=>{signal=value;await new Promise(r=>release=r);return bytes;});
  previews.reset();assert.equal(signal.aborted,true);release();await assert.rejects(pending);assert.equal(previews.cache.size,0);
  await previews.get('same-id',true,async()=>bytes);assert.equal(previews.cache.size,1);
  previews.reset(true);assert.equal(previews.cache.size,0);assert.equal(previews.bytes,0);
  let calls=0;await previews.get('same-id',true,async()=>{calls++;return bytes;});assert.equal(calls,1);
});

test('preview automatic byte budget and data URL cache remain bounded', async () => {
  const previews=new Previews();
  const bytes=Buffer.alloc(12*1024*1024);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  await previews.get('large-a',true,async()=>bytes);await previews.get('large-b',true,async()=>bytes);
  assert.ok(previews.bytes<=32*1024*1024);assert.equal(previews.cache.size,1);
  await assert.rejects(previews.get('large-c',true,async()=>bytes),/limit/);
  const signal=AbortSignal.abort();
  await assert.rejects(download('https://storage.example/file',{signal,lookup:()=>{throw Error('must not resolve DNS');}}),/abort/i);
});

test('rejects unsafe URL schemes, credentials, ports and save extensions', () => {
  for (const url of ['file:///etc/passwd','javascript:alert(1)','data:text/html,test','http://example.com','https://user:secret@example.com','https://example.com:8443']) assert.throws(() => safeURL(url));
  assert.equal(safeURL('https://example.com/image.png').hostname, 'example.com');
  for (const name of ['file.html','file.svg','run.desktop','run.exe','test.sh']) assert.throws(() => saveName(name));
  assert.equal(saveName('../../release.txt'), '_.._release.txt');
  assert.throws(() => rasterType(Buffer.from('<svg onload="bad()"/>')));
  assert.equal(rasterType(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
});

test('blocks private and reserved destinations before any connection', async () => {
  for (const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','0.0.0.0']) {
    await assert.rejects(download('https://storage.example/file', {
      lookup:async () => [{address,family:address.includes(':') ? 6 : 4}],
      get:() => { throw new Error('must not connect'); }
    }), /Private network/);
  }
});

test('presigned downloads pin public DNS, omit credentials and reject redirects', async () => {
  let captured;
  const deps = {
    lookup:async () => [{address:'93.184.216.34',family:4}],
    get:(url, options, callback) => {
      captured = options;
      const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => {};
      queueMicrotask(() => {
        const response = new EventEmitter(); response.headers = {location:'https://evil.example'}; response.statusCode = 302; response.destroy = () => {};
        callback(response);
      });
      return req;
    }
  };
  await assert.rejects(download('https://storage.example/file?signature=private', deps), /File unavailable/);
  assert.deepEqual(captured.headers, {Accept:'*/*'});
  captured.lookup('storage.example', {}, (_error, address) => assert.equal(address, '93.184.216.34'));
});

test('attachment ticket uses documented authenticated fixed-origin endpoint', async () => {
  const {api} = require('./api.cjs');
  let call;
  const client = api('fixture', async (url, options) => {call = {url,options}; return Response.json({url:'https://storage.example/file',expiresAt:'2026-11-22T00:00:00Z'});});
  await client.attachment('t1','file_123');
  assert.equal(call.url.href, 'https://api.capy.ai/api/v1/threads/t1/attachments/file_123/download');
  assert.equal(call.options.headers.Authorization, 'Bearer fixture');
  assert.equal(call.options.redirect, 'error');
  assert.throws(() => client.attachment('t1','../../secret'));
});

test('download returns bytes and enforces advertised and streamed limits', async () => {
  for (const kind of ['success','advertised','streamed']) {
    const result = download('https://storage.example/file', {
      lookup:async () => [{address:'93.184.216.34',family:4}],
      get:(_url, _options, callback) => {
        const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => {};
        queueMicrotask(() => {
          const response = new EventEmitter(); response.statusCode = 200;
          response.headers = {'content-length':kind === 'advertised' ? 13000000 : undefined}; response.destroy = () => {};
          callback(response);
          response.emit('data', kind === 'streamed' ? Buffer.alloc(13000000) : Buffer.from('file bytes'));
          response.emit('end');
        });
        return req;
      }
    });
    if (kind === 'success') assert.equal((await result).toString(), 'file bytes');
    else await assert.rejects(result, /12 MiB/);
  }
});
