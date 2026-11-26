const fs = require('node:fs');
const path = require('node:path');

const mainFiles = new Set(['main.cjs', 'product-identity.cjs', 'preload.cjs', 'connection.cjs', 'api.cjs', 'media.cjs', 'workspace.cjs', 'stream.cjs', 'zoom.cjs', 'layout.cjs', 'demo.cjs', 'stream-demo.cjs', 'keymaps.js', 'sidebar-state.js', 'layout-state.js', 'conversation-settings.js', 'dev-runtime.cjs', 'dev-watch.cjs', 'dev-build.cjs', 'dev-launch.cjs']);
function classify(name) {
  if (typeof name !== 'string' || path.basename(name) !== name) return null;
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.css$/.test(name)) return 'style';
  if (mainFiles.has(name) || name === 'package.json' || name === 'build.cjs') return 'restart';
  if (name.startsWith('dev-') || /(\.bundle\.js|\.test\.cjs|-smoke\.cjs|^smoke\.cjs|^test-support\.cjs|^hidden-proof\.cjs)$/.test(name)) return null;
  if (/^provider(?:-[a-z]+)?\.cjs$/.test(name)) return 'restart';
  if (name === 'index.html' || /\.(js|cjs)$/.test(name)) return 'renderer';
  return null;
}

function watch({directory, build, emit, delay = 180, watchDirectory = fs.watch}) {
  let timer, running = false, closed = false;
  const pending = new Set();
  async function flush() {
    timer = null;
    if (closed || running || !pending.size) return;
    running = true;
    const changes = [...pending];
    pending.clear();
    try {
      if (changes.some(name => classify(name) === 'renderer')) await build(changes);
      if (!closed) emit({type: changes.some(name => classify(name) === 'restart') ? 'restart' : changes.some(name => classify(name) === 'renderer') ? 'renderer' : 'style', changes});
    } catch {
      if (!closed) emit({type:'error', message:'Build failed. The current renderer is unchanged; fix the source and save again.'});
    } finally {
      running = false;
      if (!closed && pending.size) timer = setTimeout(flush, delay);
    }
  }
  const watcher = watchDirectory(directory, (_event, name) => {
    name = name?.toString();
    if (closed || !classify(name)) return;
    pending.add(name);
    if(!timer)timer = setTimeout(flush, delay);
  });
  watcher.on('error', () => { if (!closed) emit({type:'error', message:'Source watcher stopped. Restart Dev to watch changes again.'}); });
  return {close() { closed = true; clearTimeout(timer); pending.clear(); watcher.close(); }};
}
module.exports = {classify, watch, mainFiles};
