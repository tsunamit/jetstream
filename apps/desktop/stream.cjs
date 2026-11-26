const { setTimeout: delay } = require('node:timers/promises');
const BASE = 'https://api.capy.ai/api/v1/';
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const cursor = value => typeof value === 'string' && /^[A-Za-z0-9]{26}$/.test(value);
const string = (value, limit = 200000) => typeof value === 'string' ? value.slice(0, limit).replace(/capy_[A-Za-z0-9_-]{43}/g, '[redacted]') : '';
const limitError = () => Object.assign(Error('Stream frame limit exceeded.'),{streamLimit:true});

class SSE {
  constructor(emit) { this.emit = emit; this.buffer = ''; this.frame = {}; this.bytes = 0; this.skipLF = false; }
  push(text) {
    for (const part of text.split(/(\r\n|\r|\n)/)) {
      if (part === '\n' && this.skipLF) { this.skipLF = false; continue; }
      if (/^[\r\n]+$/.test(part)) {
        this.line(this.buffer); this.buffer = ''; this.skipLF = part === '\r';
      } else {
        if (part) this.skipLF = false;
        this.buffer += part;
        if (Buffer.byteLength(this.buffer,'utf8') + this.bytes > 524288) throw limitError();
      }
    }
  }
  line(line) {
    this.bytes += Buffer.byteLength(line,'utf8');
    if (this.bytes > 524288) throw limitError();
    if (!line) { const frame = this.frame; this.frame = {}; this.bytes = 0; if (frame.data !== undefined || frame.retry !== undefined) this.emit(frame); return; }
    if (line[0] === ':') return;
    const colon = line.indexOf(':'), name = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (name === 'data') this.frame.data = this.frame.data === undefined ? value : this.frame.data + '\n' + value;
    else if (name === 'event') this.frame.event = value;
    else if (name === 'id' && !value.includes('\0')) this.frame.id = value;
    else if (name === 'retry' && /^\d+$/.test(value)) this.frame.retry = Math.max(500, Math.min(300000, Number(value)));
  }
}

function sanitize(frame) {
  const event = frame.event;
  if (!['assistant','tool_call','transcript','status','subagent','task','run','turn','heartbeat','error','done'].includes(event)) return null;
  const d = JSON.parse(frame.data);
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw Error('Invalid stream data.');
  let data;
  if (event === 'assistant' || event === 'tool_call') {
    if (!identifier(d.callId) || typeof d.text !== 'string') throw Error('Invalid live frame.');
    data = {callId:d.callId, text:string(d.text)};
    if (d.text.length > 200000) {data.text='';data.limited=true;}
    if (event === 'tool_call') data.name = string(d.name, 100);
  } else if (event === 'transcript') {
    if (!identifier(d.id) || !['user','assistant','tool'].includes(d.source)) return null;
    data = {id:d.id, source:d.source, text:string(d.text), createdAt:string(d.createdAt, 64)};
    if (d.text?.length > 200000 || d.attachments?.length > 20) data.partial = true;
    if (identifier(d.callId)) data.callId = d.callId;
    if (typeof d.clientKey==='string' && /^[A-Za-z0-9_-]{1,64}$/.test(d.clientKey)) data.clientKey=string(d.clientKey,64);
    if (typeof d.tool === 'string') data.tool = string(d.tool, 100);
    if (typeof d.model === 'string') data.model = string(d.model, 160);
    data.attachments = (Array.isArray(d.attachments) ? d.attachments : []).slice(0, 20).filter(a => identifier(a?.file?.fileId)).map(a => ({title:string(a.title, 256), file:{fileId:a.file.fileId, name:string(a.file.name, 256), mediaType:string(a.file.mediaType, 100), sizeBytes:Number(a.file.sizeBytes) || 0, sourcePath:string(a.file.sourcePath, 1024)}}));
    if(identifier(d.sender?.id)&&['parent','ancestor','captain','peer'].includes(d.sender.relation))data.sender={id:d.sender.id,relation:d.sender.relation};
    if(Array.isArray(d.references)) {
      const valid=d.references.filter(ref=>ref&&['location','path','version'].every(key=>typeof ref[key]==='string'&&ref[key].length>0&&ref[key].length<=1024));
      if(valid.length!==d.references.length||valid.length>20)data.partial=true;
      data.references=valid.slice(0,20).map(ref=>({location:string(ref.location,1024),path:string(ref.path,1024),version:string(ref.version,1024),...(typeof ref.title==='string'?{title:string(ref.title,256)}:{}),...(identifier(ref.fileId)?{fileId:ref.fileId}:{})}));
    }
  } else if (['status','subagent','task'].includes(event)) {
    if (typeof d.status !== 'string' || d.status.length > 40) return null;
    data = {status:d.status, archived:d.archived === true};
    for (const k of ['threadId','subagentId','subagentPath','taskId','taskPath']) if (identifier(d[k]) || /Path$/.test(k) && typeof d[k] === 'string' && /^[0-9.]{1,100}$/.test(d[k])) data[k] = d[k];
  } else if (event === 'run' || event === 'turn') {
    if (!['start','end'].includes(d.phase)) return null;
    data = {phase:d.phase};
    if (event === 'turn' && ['settled','dropped','aborted'].includes(d.outcome)) data.outcome = d.outcome;
  } else if (event === 'error') data = {code:['unauthorized','forbidden'].includes(d.code) ? d.code : 'internal'};
  else data = {};
  return {event, data, ...(event === 'transcript' && cursor(frame.id) ? {id:frame.id} : {})};
}

function retryAfter(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value), ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(500, Math.min(Number.MAX_SAFE_INTEGER / 2, ms)) : 0;
}

class Streams {
  constructor({fetcher = (...args) => fetch(...args), emit, random = Math.random, wait = delay, stall = 45000}) {
    this.fetcher = fetcher; this.emit = emit; this.random = random; this.wait = wait; this.stall = stall;
    this.cursors = new Map(); this.cooldowns = new Map(); this.blocked = new Set(); this.limited = new Set(); this.active = null; this.serial = 0;
  }
  stop() { const a = this.active; this.active = null; if (a) { a.controller.abort(); clearTimeout(a.flushTimer); } }
  start({id, token, scope, key, mock = false, demoFetch}) {
    if (!identifier(id) || !identifier(token) || !identifier(scope)) throw Error('Invalid stream subscription.');
    this.stop();
    const a = {id, token, scope, key, mock, controller:new AbortController(), queue:[], bytes:0, sequence:0, serial:++this.serial};
    this.active = a;
    if (this.blocked.has(scope) || this.blocked.has(scope+':'+id)) { this.queue(a,{event:'connection',data:{state:'access'}}); this.flush(a); return; }
    if (this.limited.has(scope+':'+id)) {this.queue(a,{event:'connection',data:{state:'limited'}});this.flush(a);return;}
    if (mock && !demoFetch) { this.emit({id,token,events:[{event:'connection',data:{state:'mock'}}]}); return; }
    if (!mock && !key) { this.stop(); throw Error('Connect first.'); }
    a.fetcher = mock ? demoFetch : this.fetcher;
    a.promise = this.run(a);
  }
  queue(a, frame) {
    if (this.active !== a) return;
    const bytes=Buffer.byteLength(JSON.stringify(frame),'utf8');
    if (a.bytes + bytes > 1048576) { a.queue=[{event:'reset',data:{}}];a.bytes=32;a.attempt?.abort();return; }
    a.queue.push(frame); a.bytes += bytes;
    if (a.bytes >= 262144 || a.queue.length >= 100) this.flush(a);
    else if (!a.flushTimer) a.flushTimer = setTimeout(() => this.flush(a), 50);
  }
  flush(a) {
    clearTimeout(a.flushTimer); a.flushTimer = null;
    if (this.active !== a || !a.queue.length || a.inFlight) return;
    const events = a.queue; a.queue = []; a.bytes = 0;
    a.inFlight = {sequence:++a.sequence,events};
    this.emit({id:a.id, token:a.token, sequence:a.sequence, events});
  }
  ack(token, sequence) {
    const a = this.active;
    if (!a || !a.inFlight || a.token !== token || a.inFlight.sequence !== sequence) return;
    const last = a.inFlight.events.filter(f => f.event === 'transcript' && f.id).at(-1);
    if (last) {
      this.cursors.delete(a.scope + ':' + a.id); this.cursors.set(a.scope + ':' + a.id, {cursor:last.id,messageId:last.data.id});
      if (this.cursors.size > 200) this.cursors.delete(this.cursors.keys().next().value);
    }
    a.inFlight = null;
    this.flush(a);
  }
  async run(a) {
    let retry = 2000, failures = 0;
    const state = value => this.queue(a, {event:'connection',data:{state:value}});
    while (this.active === a && !a.controller.signal.aborted) {
      const cooling = (this.cooldowns.get(a.scope) || 0) - Date.now();
      if (cooling > 0) {
        state('polling');this.flush(a);
        try {await this.wait(Math.min(cooling,2147483647),undefined,{signal:a.controller.signal});} catch {return;}
        if (this.active !== a) return;
        if(cooling>2147483647)continue;
      }
      const controller = new AbortController();
      a.attempt = controller;
      const signal = AbortSignal.any([a.controller.signal,controller.signal]);
      let watchdog, reader, terminal = false, pause = 0;
      const touch = () => {clearTimeout(watchdog); watchdog = setTimeout(() => controller.abort(),this.stall);};
      state(failures ? 'reconnecting' : 'connecting'); touch();
      try {
        const url = new URL('threads/' + a.id + '/stream?frames=subagent', BASE);
        const headers = {Accept:'text/event-stream'};
        if (!a.mock) headers.Authorization = 'Bearer ' + a.key;
        const last = this.cursors.get(a.scope + ':' + a.id);
        if (last) {headers['Last-Event-ID'] = last.cursor;this.queue(a,{event:'boundary',data:{messageId:last.messageId}});}
        const response = await a.fetcher(url, {method:'GET',headers,redirect:'error',signal});
        if (this.active !== a) return;
        if ([401,403].includes(response.status)) {this.blocked.add(response.status===401?a.scope:a.scope+':'+a.id); state('access'); terminal = true; return;}
        if ([400,404].includes(response.status)) {state('unavailable'); terminal = true; return;}
        if (!response.ok) {
          pause = retryAfter(response.headers.get('retry-after'));
          if (pause) {this.cooldowns.set(a.scope,Date.now()+pause);if(this.cooldowns.size>200)this.cooldowns.delete(this.cooldowns.keys().next().value);}
          state([429,503].includes(response.status) ? 'polling' : 'offline');
          throw Error('Stream unavailable.');
        }
        if (!response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) throw Error('Invalid stream response.');
        state('streaming');
        reader = response.body.getReader();
        const parser = new SSE(raw => {
          if (terminal || signal.aborted) return;
          if (raw.retry !== undefined) retry = raw.retry;
          if (raw.data === undefined) return;
          const frame = sanitize(raw);
          if (!frame) return;
          if (frame.event === 'status' && frame.data.threadId && frame.data.threadId !== a.id) return;
          if (frame.event === 'error') {state(frame.data.code === 'internal' ? 'reconnecting' : 'access'); terminal = frame.data.code !== 'internal'; if (terminal) this.blocked.add(frame.data.code==='unauthorized'?a.scope:a.scope+':'+a.id); controller.abort(); return;}
          if (frame.event === 'done') {state('complete'); terminal = true; controller.abort();}
          this.queue(a, frame);
          failures = 0;
        });
        const decoder = new TextDecoder();
        while (!signal.aborted) {
          const {value,done} = await reader.read();
          if (done) break;
          touch();
          for (let offset = 0; offset < value.length; offset += 32768) {
            if (signal.aborted || this.active !== a) break;
            parser.push(decoder.decode(value.subarray(offset,offset + 32768),{stream:true}));
            await new Promise(resolve => setImmediate(resolve));
          }
        }
        if (terminal) return;
        state('reconnecting');
      } catch (error) {
        if(error.streamLimit || error instanceof SyntaxError) {this.limited.add(a.scope+':'+a.id);state('limited');terminal=true;return;}
        if (terminal || this.active !== a || a.controller.signal.aborted) return;
        if (!pause) state('reconnecting');
      } finally {
        clearTimeout(watchdog); controller.abort();
        reader?.cancel().catch(()=>{});
        this.flush(a);
      }
      if (terminal) return;
      failures++;
      this.queue(a,{event:'reset',data:{}}); this.flush(a);
      const backoff = Math.min(60000,retry * 2 ** Math.min(failures - 1,5));
      try {await this.wait(Math.min(2147483647,Math.max(pause,backoff + backoff * this.random() * 0.25)),undefined,{signal:a.controller.signal});} catch {return;}
    }
  }
}
module.exports = {SSE,sanitize,Streams,retryAfter,identifier,cursor};
