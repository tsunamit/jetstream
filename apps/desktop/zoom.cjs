const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function percent(value) {
  if (!Number.isInteger(value) || value < 50 || value > 200 || value % 10) throw Error('Zoom must be 50–200% in 10% steps.');
  return value;
}
function action(input, mac) {
  if (input.type !== 'keyDown' || input.isComposing || input.alt || (mac ? !input.meta || input.control : !input.control || input.meta)) return null;
  if (['+', '='].includes(input.key)) return 'in';
  if (!input.shift && input.key === '-') return 'out';
  if (!input.shift && input.key === '0') return 'reset';
  return null;
}
class Zoom {
  constructor(directory) { this.file = path.join(directory, 'appearance.json'); this.value = 100; this.error = ''; }
  load() {
    try {
      if (fs.statSync(this.file).size > 1024) throw Error('Appearance configuration is too large.');
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!saved || saved.version !== 1 || Object.keys(saved).some(key => !['version','zoomPercent'].includes(key))) throw Error('Invalid appearance configuration.');
      this.value = percent(saved.zoomPercent);
    } catch (error) { if (error.code !== 'ENOENT') this.error = 'Saved zoom is invalid; using 100%. Your file was not changed.'; }
  }
  change(direction) {
    if (!['in','out','reset'].includes(direction)) throw Error('Invalid zoom action.');
    this.value = direction === 'reset' ? 100 : Math.max(50, Math.min(200, this.value + (direction === 'in' ? 10 : -10)));
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.file), {recursive:true});
      fs.writeFileSync(temporary, JSON.stringify({version:1,zoomPercent:this.value}) + '\n', {mode:0o600,flag:'wx'});
      fs.renameSync(temporary, this.file);
      this.error = '';
    } catch (error) { this.error = 'Zoom changed for this session, but could not be saved.'; }
    finally { try { fs.unlinkSync(temporary); } catch {} }
    return this.state();
  }
  state() { return {percent:this.value,error:this.error}; }
}
module.exports = {Zoom, percent, action};
