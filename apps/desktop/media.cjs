const https = require('node:https');
const dns = require('node:dns/promises');
const ipaddr = require('ipaddr.js');
const MAX_BYTES = 12 * 1024 * 1024;

function safeURL(value) {
  if (typeof value !== 'string' || value.length > 16000) throw new Error('Unsupported URL.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('Only HTTPS links are supported.');
  return url;
}

async function download(value, dependencies = {}) {
  const signal = dependencies.signal;
  signal?.throwIfAborted();
  const url = safeURL(value);
  const lookup = dependencies.lookup || dns.lookup;
  const addresses = await lookup(url.hostname, {all:true});
  signal?.throwIfAborted();
  if (!addresses.length || addresses.some(a => !ipaddr.isValid(a.address) || ipaddr.process(a.address).range() !== 'unicast')) {
    throw new Error('Private network downloads are blocked.');
  }
  const address = addresses[0];
  const request = dependencies.get || https.get;
  return new Promise((resolve, reject) => {
    const req = request(url, {signal, headers:{Accept:'*/*'}, lookup:(_host, options, callback) => {
      callback(null, options.all ? [address] : address.address, address.family);
    }}, response => {
      if (response.statusCode !== 200 || Number(response.headers['content-length']) > MAX_BYTES) {
        response.destroy(); reject(new Error('File unavailable or larger than 12 MiB.')); return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BYTES) { response.destroy(); reject(new Error('File exceeds 12 MiB.')); }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => reject(new Error('File download failed.')));
    });
    req.setTimeout(15000, () => req.destroy());
    req.on('error', () => reject(new Error('File download failed.')));
  });
}

function rasterType(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.subarray(0,6).toString())) return 'image/gif';
  if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') return 'image/webp';
  throw new Error('This file is not a supported raster image.');
}

function saveName(name) {
  const safe = String(name || 'attachment').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^\.+/, '').slice(-120);
  if (!/\.(txt|md|csv|json|pdf|png|jpe?g|gif|webp|zip)$/i.test(safe)) throw new Error('This file type cannot be saved in this preview.');
  return safe;
}
class Previews {
  constructor() { this.cache = new Map(); this.pending = new Map(); this.active = 0; this.queue = []; this.bytes = 0; this.reset(); }
  reset(clear = false) {
    this.controller?.abort(); this.controller = new AbortController(); this.attempts = 0; this.used = 0;
    for (const job of this.queue.splice(0)) job.reject(Error('Destination changed.'));
    this.pending.clear();
    if (clear) { this.cache.clear(); this.bytes = 0; }
  }
  get(identity, auto, load) {
    if (this.cache.has(identity)) return Promise.resolve(this.cache.get(identity));
    if (this.pending.has(identity)) return this.pending.get(identity);
    if (this.queue.length >= 32 || auto && (this.attempts >= 24 || this.used >= 24 * 1024 * 1024)) return Promise.reject(Error('Automatic image limit reached. Load image to continue.'));
    if (auto) this.attempts++;
    const signal = this.controller.signal;
    const promise = new Promise((resolve, reject) => { this.queue.push({resolve, reject, signal, auto, load, identity}); this.pump(); });
    this.pending.set(identity, promise);
    promise.finally(() => { if (this.pending.get(identity) === promise) this.pending.delete(identity); }).catch(() => {});
    return promise;
  }
  pump() {
    while (this.active < 2 && this.queue.length) {
      const job = this.queue.shift(); this.active++;
      (async () => {
        job.signal.throwIfAborted();
        if (job.auto && this.used >= 24 * 1024 * 1024) throw Error('Automatic image limit reached. Load image to continue.');
        const bytes = await job.load(job.signal); job.signal.throwIfAborted();
        const type = rasterType(bytes);
        this.used += bytes.length;
        const value = {data:'data:' + type + ';base64,' + bytes.toString('base64')};
        const size = value.data.length;
        while (this.cache.size && (this.bytes + size > 32 * 1024 * 1024 || this.cache.size >= 32)) {
          const first = this.cache.keys().next().value; this.bytes -= this.cache.get(first).data.length; this.cache.delete(first);
        }
        if (size <= 32 * 1024 * 1024) { this.cache.set(job.identity, value); this.bytes += size; }
        return value;
      })().then(job.resolve, job.reject).finally(() => { this.active--; this.pump(); });
    }
  }
}
module.exports = {download, rasterType, safeURL, saveName, Previews};
