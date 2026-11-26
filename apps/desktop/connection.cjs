const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { scope } = require('./workspace.cjs');

class Connection {
  constructor({ directory, storage, validate, environment = '', flags = [] }) {
    this.directory = directory;
    this.storage = storage;
    this.validate = validate;
    this.environment = environment;
    this.flags = flags;
    this.key = '';
    this.demo = true;
    this.saved = false;
    this.warning = '';
    this.busy = false;
    this.activeWrites = 0;
    this.generation = 0;
    this.source = '';
  }
  async atomic(name, bytes) {
    await fs.mkdir(this.directory, { recursive: true });
    const destination = path.join(this.directory, name), temporary = destination + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, destination);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  status() {
    return { demo: this.demo, connected: this.demo || Boolean(this.key), saved: this.saved,
      warning: this.warning, source: this.source, scope: scope(this.key, this.demo) };
  }
  async start() {
    let mode = 'mock';
    try { mode = JSON.parse(await fs.readFile(path.join(this.directory, 'connection.json'), 'utf8')).mode === 'live' ? 'live' : 'mock'; } catch {}
    try { this.saved = (await fs.stat(path.join(this.directory, 'credential.bin'))).isFile(); } catch {}
    if (this.flags.includes('--demo')) mode = 'mock';
    else if (this.flags.includes('--live') || this.environment) mode = 'live';
    this.demo = mode === 'mock';
    if (!this.demo) {
      try {
        const candidate = this.environment || await this.read();
        if (candidate) { await this.validate(candidate); this.key = candidate; this.source = this.environment ? 'environment' : 'saved'; }
      } catch { this.warning = 'Saved or environment credential could not connect. Reconnect or forget the saved key.'; }
    }
    return this.status();
  }
  async read() {
    if (!this.saved) return '';
    if (!this.storage.isEncryptionAvailable()) throw Error('Secure storage unavailable.');
    const bytes = await fs.readFile(path.join(this.directory, 'credential.bin'));
    if (bytes.length > 16384) throw Error('Invalid credential store.');
    const candidate = this.storage.decryptString(bytes);
    if (!/^capy_[A-Za-z0-9_-]{43}$/.test(candidate)) throw Error('Invalid credential store.');
    return candidate;
  }
  async transition(action) {
    if (this.busy || this.activeWrites) throw Error('Wait for the active send, creation or connection change before switching.');
    this.busy = true;
    try { return await action(); } finally { this.busy = false; }
  }
  async connect(candidate, remember = true) {
    return this.transition(async () => {
      if (typeof candidate !== 'string' || !/^capy_[A-Za-z0-9_-]{43}$/.test(candidate) || typeof remember !== 'boolean') throw Error('Enter a valid Capy API key.');
      try { await this.validate(candidate); } catch { throw Error('Key validation failed. Check the key, access and network. Previous connection and saved key were kept.'); }
      let warning = remember ? '' : 'Connected for this session only. Any previously saved key is unchanged.';
      if (remember) {
        if (!this.storage.isEncryptionAvailable()) warning = 'Secure storage unavailable. Connected for this session only; any previously saved key is unchanged.';
        else {
          try { await this.atomic('credential.bin', this.storage.encryptString(candidate)); this.saved = true; }
          catch { throw Error('Could not save securely. Previous connection and saved key were kept. Uncheck Remember for a session-only connection.'); }
        }
      }
      try { await this.atomic('connection.json', JSON.stringify({ mode: 'live' })); }
      catch { warning += ' Last mode could not be saved; this connection is active for this session.'; }
      this.key = candidate; this.source = remember && !warning.includes('session only') ? 'saved' : 'session'; this.demo = false; this.warning = warning; this.generation++;
      return this.status();
    });
  }
  async mode(mode) {
    return this.transition(async () => {
      if (!['live', 'mock'].includes(mode)) throw Error('Choose Live or Mock.');
      let candidate = this.key;
      let source = this.source;
      if (mode === 'live') {
        try { if (!candidate) { candidate = this.environment || await this.read(); source = this.environment ? 'environment' : 'saved'; } }
        catch { throw Error('Saved key could not be unlocked. Reconnect or forget it. Current mode was kept.'); }
        if (!candidate) return { ...this.status(), needsKey: true };
        try { await this.validate(candidate); } catch { throw Error('Live connection failed. Reconnect or forget the saved key. Current mode was kept.'); }
      }
      await this.atomic('connection.json', JSON.stringify({ mode }));
      this.key = candidate; this.source = source; this.demo = mode === 'mock'; this.warning = mode === 'live' && source === 'session' ? 'Connected for this session only. Any previously saved key is unchanged.' : ''; this.generation++;
      return this.status();
    });
  }
  async forget() {
    return this.transition(async () => {
      await this.atomic('connection.json', JSON.stringify({ mode: 'mock' }));
      await fs.rm(path.join(this.directory, 'credential.bin'), { force: true });
      this.saved = false; this.key = ''; this.environment = ''; this.source = ''; this.demo = true; this.generation++;
      this.warning = 'Saved key removed from this Mac. This does not revoke it at Capy.';
      return this.status();
    });
  }
}
module.exports = { Connection };
