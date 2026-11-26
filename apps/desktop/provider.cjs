const {createHash} = require('node:crypto');

class ProviderError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const methods = ['workspace','projects','threads','messages','send','models','create','metadata','readState','receipt','context','attachment'];
const required = {send:'send',models:'models',create:'create',receipt:'read',readState:'read',context:'hierarchy',attachment:'attachments'};

class ProviderSession {
  constructor() { this.generation = 0; this.adapter = null; }
  use(adapter, accountScope) {
    this.adapter?.stop();
    this.generation++;
    this.adapter = adapter;
    this.scope = createHash('sha256').update(JSON.stringify([adapter.id,accountScope])).digest('hex').slice(0,24);
  }
  describe() {
    return {id:this.adapter.id, name:this.adapter.name, scope:this.scope, generation:this.generation, capabilities:this.adapter.capabilities};
  }
  async call(method, ...args) {
    if (!methods.includes(method)) throw new ProviderError('invalid','Unknown provider operation.');
    const adapter = this.adapter, generation = this.generation, capability = required[method];
    if (capability && !adapter.capabilities[capability].supported) throw new ProviderError('unsupported',adapter.capabilities[capability].reason);
    if(method==='send' && args[3] && !adapter.capabilities.modelSelection.supported)throw new ProviderError('unsupported',adapter.capabilities.modelSelection.reason);
    try {
      const result = await adapter[method](...args);
      if (generation !== this.generation) throw new ProviderError('stale','Provider or account changed.');
      return result;
    } catch (error) {
      if (generation !== this.generation) throw new ProviderError('stale','Provider or account changed.');
      throw error;
    }
  }
  stream(input) {
    if (!input) { this.stop(); return; }
    if (!this.adapter.capabilities.stream.supported) throw new ProviderError('unsupported',this.adapter.capabilities.stream.reason);
    if(!opaque(input.id) || !opaque(input.token))throw new ProviderError('invalid','Invalid stream subscription.');
    this.adapter.stream(input);
  }
  ack(token, sequence) { this.adapter.ack(token,sequence); }
  stop() { this.adapter?.stop(); }
}
module.exports = {ProviderSession,ProviderError,opaque};
