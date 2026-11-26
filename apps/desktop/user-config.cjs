const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash, randomUUID} = require('node:crypto');
const Keymaps = require('./keymaps.js');
const Layout = require('./layout-state.js');

const defaults = mac => ({version:1, keymaps:Keymaps.defaults(mac), layout:Layout.defaults(), showToolActivity:true});
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function parseJSON(bytes) {
  try { return JSON.parse(bytes); }
  catch(error) {
    const position = Number(/position (\d+)/.exec(error.message)?.[1] ?? bytes.length);
    const line = bytes.slice(0, position).split('\n').length;
    throw Error('line ' + line + ': invalid JSON. Fix the syntax, then save or Reload config.');
  }
}
function validate(value, mac) {
  if (!plain(value) || value.version !== 1) throw Error('version: expected config version 1.');
  function inspect(object, prefix = '') {
    for (const [key, item] of Object.entries(object)) {
      const location = prefix + key;
      if (/secret|token|password|credential|api.?key|profile|history|model|plugin|exec|include|draft|session|conversation|messages|threads|provider|account|user.?data|__proto__|constructor|prototype/i.test(key) || /^(auth|authentication|authorization)$/i.test(key)) throw Error(location + ': private or unsafe fields are not allowed.');
      if (!prefix && ['keymaps','layout'].includes(key)) continue;
      if (item && typeof item === 'object') inspect(item, location + '.');
    }
  }
  inspect(value);
  const config = {...defaults(mac), ...value};
  try { Keymaps.compile(config.keymaps, mac); } catch(error) { throw Error('keymaps: ' + error.message); }
  try { config.layout = Layout.config(config.layout); } catch(error) { throw Error('layout: ' + error.message); }
  if (typeof config.showToolActivity !== 'boolean') throw Error('showToolActivity: expected true or false.');
  return config;
}
function configPath({args = [], packaged = false, dev = false, profile, home = os.homedir()}) {
  const override = args.find(arg => arg.startsWith('--config-file='));
  if (override) {
    if (packaged || !dev && !args.includes('--test-hidden')) throw Error('--config-file is only available in unpackaged Dev or hidden tests.');
    const file = override.slice(14);
    if (!path.isAbsolute(file)) throw Error('--config-file requires an absolute path.');
    if (args.includes('--test-hidden')) {
      const relative=path.relative(os.tmpdir(), file);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Hidden config overrides require a temporary path.');
    }
    return file;
  }
  if (args.includes('--test-hidden')) return path.join(profile, 'config.json');
  const name = args.find(arg => arg.startsWith('--dev-profile='))?.slice(14) || 'default';
  if (dev && !/^[a-zA-Z0-9_-]{1,40}$/.test(name)) throw Error('Invalid Dev profile name.');
  return dev ? path.join(home,'.config','jetstream-dev','profiles',name,'config.json') : path.join(home,'.config','jetstream','config.json');
}
class UserConfig {
  constructor({file, legacyDirectory, mac = process.platform === 'darwin', emit = () => {}}) {
    this.file = file; this.legacyDirectory = legacyDirectory; this.mac = mac; this.emit = emit;
    this.config = defaults(mac); this.diskRevision = 'missing'; this.generation = 0; this.revision = '0:missing'; this.error = '';
  }
  bytes() {
    try {
      const stat=fs.lstatSync(this.file);
      if (stat.isSymbolicLink()) throw Error('Symlinks are not supported; use a regular config file.');
      if (!stat.isFile()) throw Error('Config must be a regular JSON file.');
      if (stat.size > 65536) throw Error('Config exceeds 64 KiB.');
      const bytes=fs.readFileSync(this.file, 'utf8');
      if(Buffer.byteLength(bytes)>65536)throw Error('Config exceeds 64 KiB.');
      return bytes;
    } catch(error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  digest(bytes) { return bytes === null ? 'missing' : createHash('sha256').update(bytes).digest('hex'); }
  snapshot() { return structuredClone({config:this.config, revision:this.revision, error:this.error, path:this.file, mac:this.mac, repairKeymaps:this.repairKeymaps??null}); }
  parse(bytes) {
    return validate(parseJSON(bytes), this.mac);
  }
  load(notify = true) {
    let bytes;
    try {
      bytes = this.bytes();
      const digest = this.digest(bytes);
      if (digest !== this.diskRevision) this.generation++;
      this.diskRevision = digest;
      this.revision = this.generation + ':' + digest;
      if (bytes === null) throw Error('File is missing. Restore it or save a new config, then Reload config.');
      const config = this.parse(bytes);
      this.config = config; this.error = ''; this.repairKeymaps = null;
    } catch(error) { this.error = this.file + ': ' + error.message + ' Last valid settings remain active.'; }
    const result = this.snapshot();
    if (notify) this.emit(result);
    return result;
  }
  legacy() {
    const config = defaults(this.mac);
    if (!this.legacyDirectory) return config;
    let failure;
    for (const [name, section] of [['keymaps.json','keymaps'],['layout.json','layout']]) {
      const file = path.join(this.legacyDirectory, name);
      try {
        if (fs.statSync(file).size > 32768) throw Error('Legacy file exceeds 32 KiB.');
        const saved = parseJSON(fs.readFileSync(file,'utf8'));
        config[section] = section === 'keymaps' ? Keymaps.migrate(saved, this.mac) : Layout.config(saved);
      } catch(error) {
        if (error.code === 'ENOENT') continue;
        const repair=error.config;
        if(section==='keymaps'&&plain(repair)&&Object.keys(repair).every(key=>['version','leader','timeout','mappings'].includes(key))&&typeof repair.leader==='string'&&Number.isInteger(repair.timeout)&&plain(repair.mappings)&&Object.entries(repair.mappings).every(([id,keys])=>Object.hasOwn(Keymaps.actions,id)&&Array.isArray(keys)&&keys.every(key=>typeof key==='string')))this.repairKeymaps=repair;
        failure??=Error(file + ': migration stopped. ' + error.message);
      }
    }
    if(failure) {this.config=validate(config,this.mac);throw failure;}
    return validate(config, this.mac);
  }
  start() {
    try {
      fs.mkdirSync(path.dirname(this.file), {recursive:true, mode:0o700});
      if (this.bytes() === null) {
        this.migratePending=true;
        const bytes = JSON.stringify(this.legacy(), null, 2) + '\n';
        const temporary=this.file+'.'+randomUUID()+'.tmp';
        try {
          fs.writeFileSync(temporary,bytes,{flag:'wx',mode:0o600});
          fs.linkSync(temporary,this.file);
        } catch(error) { if (error.code !== 'EEXIST') throw error; this.migratePending=false; }
        finally { try { fs.unlinkSync(temporary); } catch {} }
      }
      this.load(false);
    } catch(error) { this.error = this.file + ': ' + error.message + ' Available settings are active; legacy files were not changed.'; }
    try {
      this.watcher = fs.watch(path.dirname(this.file), (_event, name) => {
        if (name && name.toString() !== path.basename(this.file)) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.load(), 100);
      });
      this.watcher.on('error', () => { this.error = this.file + ': watcher unavailable. Use Reload config after editing.'; this.emit(this.snapshot()); });
    } catch(error) { this.error = this.file + ': ' + error.message + ' Use Reload config after fixing file access.'; }
    return this.snapshot();
  }
  update(section, value, revision) {
    if (!['keymaps','layout','showToolActivity'].includes(section)) throw Error('Unsupported config section.');
    const bytes = this.bytes();
    if (this.diskRevision !== this.digest(bytes) || revision !== this.revision) {
      this.load(); throw Error('Config changed on disk. Review the reloaded settings and retry your change.');
    }
    const document = bytes === null ? this.config : this.parse(bytes);
    const config = validate({...document, [section]:value}, this.mac);
    const serialized = JSON.stringify(config, null, 2) + '\n';
    if (Buffer.byteLength(serialized) > 65536) throw Error('Config exceeds 64 KiB.');
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, serialized, {flag:'wx',mode:0o600});
      if (this.digest(this.bytes()) !== this.diskRevision) { this.load(); throw Error('Config changed during save. Review the settings and retry.'); }
      if(bytes===null) {
        try { fs.linkSync(temporary,this.file); }
        catch(error) { if(error.code!=='EEXIST')throw error;this.load();throw Error('Config was created during save. Review the settings and retry.'); }
      } else fs.renameSync(temporary, this.file);
    } finally { try { fs.unlinkSync(temporary); } catch {} }
    return this.load();
  }
  migrateToolActivity(value) {
    const migrate = this.migratePending; this.migratePending = false;
    if (migrate && typeof value === 'boolean') {
      if (this.digest(this.bytes()) !== this.diskRevision) return this.load();
      if(this.error) {
        if(this.diskRevision==='missing')this.config.showToolActivity=value;
        return this.snapshot();
      }
      return this.update('showToolActivity', value, this.revision);
    }
    return this.snapshot();
  }
  close() { clearTimeout(this.timer); this.watcher?.close(); }
}
module.exports = {UserConfig, defaults, validate, configPath};
