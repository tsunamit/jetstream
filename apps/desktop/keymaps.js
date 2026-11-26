(function (root) {
  const actions = {
    openConfig: ['Open settings config in editor', 'navigation', []],
    reloadConfig: ['Reload settings config', 'navigation', []],
    workActivity: ['Work overview', 'navigation', ['<leader>k']],
    conversationModel: ['Model for next message', 'navigation', ['<leader>tm']],
    centralSearch: ['Search captains and threads', 'navigation', ['<leader>pf']],
    toggleSidebar: ['Show / hide sidebar', 'navigation', ['<leader>e']],
    toggleToolActivity: ['Show / hide public tool activity', 'navigation', ['<leader>vt']],
    newThread: ['New thread', 'navigation', ['<leader>tn']],
    back: ['Back through views', 'navigation', ['<C-o>', '<A-Left>']],
    forward: ['Forward through views', 'navigation', ['<C-i>', '<A-Right>']],
    switchPane: ['Cycle windows', 'navigation', ['gt', 'gT', '<leader>ww']],
    navigator: ['Legacy: focus navigator', 'navigation', []],
    resetLayout:['Reset pane sizes','navigation',[]],
    conversation: ['Legacy: focus conversation', 'navigation', []],
    windowLeft: ['Window: left', 'windows', ['<leader>wh','<C-w>h','<C-h>']],
    windowDown: ['Window: down to reply', 'windows', ['<leader>wj','<C-w>j','<C-j>']],
    windowUp: ['Window: up to chat', 'windows', ['<leader>wk','<C-w>k','<C-k>']],
    windowRight: ['Window: right', 'windows', ['<leader>wl','<C-w>l','<C-l>']],
    down: ['Next thread', 'navigator', ['j', '<Down>', '<C-n>']],
    navigatorHalfDown:['Navigator: half-page down','navigator',['<C-d>']], navigatorHalfUp:['Navigator: half-page up','navigator',['<C-u>']],
    up: ['Previous thread', 'navigator', ['k', '<Up>', '<C-p>']],
    reply: ['Focus reply (Insert)', 'navigation', ['i', 'o', 'a']],
    help: ['Show shortcuts', 'navigation', ['?']],
    markRead: ['Mark thread read (loaded tail)', 'navigation', ['<leader>mr']],
    markUnread: ['Mark thread unread', 'navigation', ['<leader>mu']],
    settings: ['Keymaps settings', 'navigation', ['<leader>,']],
    resultsGlobal: ['Recent results (including from reply)', 'global', ['<D-S-k>']],
    threads: ['Recent threads · all projects', 'navigation', ['<leader>rt']],
    captains: ['Recent captain visits', 'navigation', ['<leader>rc']],
    running: ['Running picker', 'navigation', ['<leader>rr']],
    needs: ['Needs me picker', 'navigation', ['<leader>n']],
    results: ['Recently done turns · results (demo)', 'navigation', ['<leader>rd']],
    pins: ['Pinned picker', 'navigation', ['<leader>h']],
    pin: ['Pin / unpin thread', 'navigation', ['<leader>a']],
    pin1: ['Quick jump 1', 'navigation', ['<leader>1']],
    pin2: ['Quick jump 2', 'navigation', ['<leader>2']],
    pin3: ['Quick jump 3', 'navigation', ['<leader>3']],
    pin4: ['Quick jump 4', 'navigation', ['<leader>4']],
    normal: ['Reply: enter composer normal', 'composer', ['<Esc>', 'jk']],
    send: ['Queue reply', 'composer', ['<C-Enter>']],
    pickerNext: ['Next picker result', 'picker', ['<Down>', '<C-n>']],
    pickerPrevious: ['Previous picker result', 'picker', ['<Up>', '<C-p>']],
    pickerCollectionNext: ['Picker: next collection', 'picker', ['<C-PageDown>']],
    pickerCollectionPrevious: ['Picker: previous collection', 'picker', ['<C-PageUp>']],
    pickerHalfDown:['Picker: half-page down','picker',['<C-d>']], pickerHalfUp:['Picker: half-page up','picker',['<C-u>']],
    pickerOpen: ['Open picker result (search focus)', 'picker', ['<Enter>']]
  };
  Object.assign(actions, {
    chatReference:['Chat: open reference','chat',['gd']],
    chatHalfDown:['Chat: half-page down','chat',['<C-d>']], chatHalfUp:['Chat: half-page up','chat',['<C-u>']],
    chatLeft:['Chat: previous character','chat',['h']], chatRight:['Chat: next character','chat',['l']],
    chatDown:['Chat: next logical line','chat',['j']], chatUp:['Chat: previous logical line','chat',['k']],
    chatWord:['Chat: next word','chat',['w']], chatBackWord:['Chat: previous word','chat',['b']],
    chatStart:['Chat: line start','chat',['0']], chatEnd:['Chat: line end','chat',['$']],
    chatFirst:['Chat: first character','chat',['gg']], chatLast:['Chat: last character','chat',['G']],
    chatPreviousMessage:['Chat: previous message','chat',['{']], chatNextMessage:['Chat: next message','chat',['}']],
    chatVisual:['Chat: character visual selection','chat',['v']], chatVisualLine:['Chat: line visual selection','chat',['V']],
    chatYank:['Chat: yank visual selection','chat',['y']], chatCancel:['Chat: cancel visual selection','chat',['<Esc>']],
    chatSearch:['Chat: search text','chat',['/']], chatNextMatch:['Chat: next match','chat',['n']], chatPreviousMatch:['Chat: previous match','chat',['N']],
    chatActivate:['Chat: open current image / diagram source','chat',['<Enter>']],
    draftLeft:['Draft: previous character','composerNormal',['h']], draftRight:['Draft: next character','composerNormal',['l']],
    draftDown:['Draft: next line','composerNormal',['j']], draftUp:['Draft: previous line','composerNormal',['k']],
    draftWord:['Draft: next word','composerNormal',['w']], draftBackWord:['Draft: previous word','composerNormal',['b']],
    draftStart:['Draft: line start','composerNormal',['0']], draftEnd:['Draft: line end','composerNormal',['$']],
    draftFirst:['Draft: first character','composerNormal',['gg']], draftLast:['Draft: last character','composerNormal',['G']],
    draftAppend:['Draft: insert after cursor','composerNormal',['a']], draftDelete:['Draft: delete character','composerNormal',['x']],
    draftDeleteLine:['Draft: delete line','composerNormal',['dd']], draftDeleteWord:['Draft: delete word','composerNormal',['dw']],
    draftYankLine:['Draft: yank line','composerNormal',['yy']], draftPaste:['Draft: paste local yank after cursor','composerNormal',['p']],
    draftUndo:['Draft: undo last normal edit','composerNormal',['u']],
    draftExit:['Draft: cancel selection (keep focus)','composerNormal',['<Esc>']]
  });
  for (const prefix of ['chat','draft']) {
    actions[prefix + 'Down'][2].push('<Down>', '<C-n>');
    actions[prefix + 'Up'][2].push('<Up>', '<C-p>');
  }
  for (const [id,action] of Object.entries(actions)) if(id.startsWith('draft')) action[2]=[];
  for (const [prefix,scope] of [['navigator','navigator'],['chat','chat'],['pickerBrowse','pickerBrowse']]) {
    for (const [suffix,label,keys] of [
      ['First','first loaded item',['gg']],['Last','last loaded item',['G']],
      ['PageDown','page down',['<C-f>']],['PageUp','page up',['<C-b>']],
      ['Find',prefix==='chat'?'search loaded text':'filter items',['/']]
    ]) if (!(prefix==='chat' && ['First','Last','Find'].includes(suffix))) actions[prefix+suffix]=[prefix+': '+label,scope,keys];
  }
  Object.assign(actions,{
    navigatorCollapse:['Navigator: collapse / parent','navigator',['h','<Left>']],
    navigatorExpand:['Navigator: expand','navigator',['l','<Right>']],
    pickerBrowseNext:['Picker browse: next row','pickerBrowse',['j']],
    pickerBrowsePrevious:['Picker browse: previous row','pickerBrowse',['k']],
    pickerBrowseMode:['Picker: browse results','picker',['<C-g>']],
    pickerBrowseQuery:['Picker browse: edit query','pickerBrowse',['i']],
    chatLoadOlder:['Chat: load earlier page','chat',['[m']],
    chatLoadNewer:['Chat: load newer page','chat',[']m']]
  });
  actions.chatFirst[0]='Chat: first loaded character';actions.chatLast[0]='Chat: last loaded character';
  const named = {Space:' ', Esc:'Escape', Enter:'Enter', Left:'ArrowLeft', Right:'ArrowRight', Up:'ArrowUp', Down:'ArrowDown', Backspace:'Backspace', Delete:'Delete', Home:'Home', End:'End', PageUp:'PageUp', PageDown:'PageDown'};
  const defaults = mac => ({version:3, leader:'<Space>', timeout:900, mappings:{...(mac ? {send:['<C-Enter>', '<M-Enter>']} : {})}});
  const fallback = (id,mac=false) => id === 'resultsGlobal' && mac ? ['<D-k>'] : actions[id][2];
  function migrate(saved, mac = false) {
    if (![1,2].includes(saved?.version)) { try {compile(saved,mac);} catch(cause) {const error=Error(cause.message+' Your file was not changed. Open Keymaps to repair.'); error.config=saved; throw error;} return saved; }
    if (!saved.mappings || Array.isArray(saved.mappings) || typeof saved.mappings !== 'object') throw Error('Mappings must be an object.');
    const config = {...saved, version:3, mappings:{...saved.mappings}};
    if (saved.version === 1) for (const [id, old] of Object.entries({threads:'<leader>t', running:'<leader>r', results:'<leader>u', down:'j', up:'k', chatDown:'j', chatUp:'k', draftDown:'j', draftUp:'k'})) {
      if (JSON.stringify(config.mappings[id]) === JSON.stringify([old])) delete config.mappings[id];
    }
    for (const [id, old] of Object.entries({navigator:['<C-w>h'],conversation:['<C-w>l'],switchPane:['gt','gT'],normal:['<Esc>']})) {
      if (JSON.stringify(config.mappings[id]) === JSON.stringify(old)) delete config.mappings[id];
    }
    if (!mac && ['<D-k>','<C-k>'].some(old => JSON.stringify(config.mappings.resultsGlobal) === JSON.stringify([old]))) delete config.mappings.resultsGlobal;
    try { compile(config, mac); }
    catch (cause) {
      const error = Error('Shortcut migration blocked: ' + cause.message + ' Your file was not changed. Open Keymaps; your mappings are loaded there for repair. Remap the conflicting action, then Save keymaps.');
      error.config = config;
      throw error;
    }
    return config;
  }
  function activeScopes(scope) {
    return [scope, ...(scope==='pickerBrowse'?['picker']:[]), ...(['navigator','chat','composerNormal'].includes(scope) ? ['navigation'] : []), ...(['navigator','chat','chatControl','composerNormal','composer','composerWindow','separator'].includes(scope) ? ['windows'] : []), ...(!['picker','pickerBrowse'].includes(scope) ? ['global'] : [])];
  }
  function overlaps(a, b) {
    return ['navigator','chat','composerNormal','composer','picker','pickerBrowse','text'].some(scope => {
      const active = activeScopes(scope); return active.includes(a) && active.includes(b);
    });
  }
  function parse(text, leader, mac, windowScope = false) {
    if (typeof text !== 'string' || !text || text.length > 120) throw Error('Use a nonempty sequence of at most 120 characters.');
    text = text.replace(/<leader>/gi, leader);
    const parts = text.match(/<[^>]+>|[^<>]/gu);
    if (!parts || parts.join('') !== text || parts.length > 8) throw Error('Invalid sequence (maximum eight keys).');
    return parts.map(part => {
      let key = part, mods = [];
      if (part.startsWith('<')) {
        const bits = part.slice(1, -1).split('-');
        key = bits.pop();
        mods = bits.map(mod => mod.toUpperCase() === 'D' ? mac ? 'M' : 'C' : mod.toUpperCase());
        if (mods.some(mod => !['C','M','A','S'].includes(mod)) || new Set(mods).size !== mods.length) throw Error('Modifiers: C (Ctrl), M (Meta), A (Alt), S (Shift), D (platform primary).');
        key = named[key] ?? (/^F([1-9]|1[0-2])$/.test(key) ? key : key.length === 1 ? key : null);
        if (!key) throw Error('Unknown key name. Tab is reserved for focus traversal.');
      }
      if (mods.includes('M') && !mac) throw Error('Meta/Super chords are unsupported on this platform; use D or C.');
      if (mods.includes('S') && key.length === 1 && !mods.some(m => ['C','M','A'].includes(m))) { key = key.toUpperCase(); mods = mods.filter(m => m !== 'S'); }
      if (mods.some(m => ['C','M','A'].includes(m)) && key.length === 1) key = key.toLowerCase();
      const chord = [...mods.sort(), key].join(':');
      if (['F5','F11','F12'].includes(key) || mods.includes('M') && [' ','h','m','n','w',','].includes(key) || mods.includes('A') && key === ' ' || mods.includes('C') && mods.includes('A') && key === 'Delete') throw Error('Reserved operating-system or application shortcut.');
      if (key === '\t' || key === 'Tab' || key === '\n' || (mods.includes(mac ? 'M' : 'C') && ['a','c','v','x','z','q','r','l','t','+','-','=','0'].includes(key) && !(windowScope && chord === 'C:l')) || mods.includes('A') && key === 'F4') throw Error('Reserved native editing, window, or application shortcut.');
      return chord;
    });
  }
  function compile(config, mac = false) {
    if (!config || ![1,2,3].includes(config.version) || Object.keys(config).some(k => !['version','leader','timeout','mappings'].includes(k))) throw Error('Expected keymaps version 1, 2 or 3.');
    const leader = parse(config.leader, '', mac);
    if (leader.length !== 1 || leader[0].length !== 1) throw Error('Leader must be one unmodified printable key.');
    if (!Number.isInteger(config.timeout) || config.timeout < 250 || config.timeout > 3000) throw Error('Timeout must be 250–3000 milliseconds.');
    if (!config.mappings || Array.isArray(config.mappings) || typeof config.mappings !== 'object') throw Error('Mappings must be an object.');
    for (const id of Object.keys(config.mappings)) if (!Object.hasOwn(actions, id)) throw Error('Unknown action: ' + id);
    const bindings = [];
    for (const [id, [label, scope]] of Object.entries(actions)) {
      const values = Object.hasOwn(config.mappings, id) ? config.mappings[id] : fallback(id,mac);
      if (!Array.isArray(values) || values.length > 8) throw Error(label + ': expected up to eight sequences (empty array unmaps).');
      for (const value of values) {
        let keys;
        try { keys = parse(value, config.leader, mac, scope === 'windows'); } catch (error) { throw Error(label + ': ' + error.message); }
        if (scope === 'global' && (keys.length !== 1 || !/[CM]:/.test(keys[0]))) throw Error(label + ': global binding must be one Ctrl/Meta chord.');
        if (['composer','picker'].includes(scope) && keys.some(k => k.length === 1) && !(id === 'normal' && keys.every(k => k.length === 1))) throw Error(label + ': text scopes require named or modified keys.');
        if (keys.includes('Escape') && !(['normal','chatCancel','draftExit'].includes(id) && keys.length === 1)) throw Error('Escape is reserved for cancellation.');
        if (scope === 'composer' && id === 'send' && !keys.every(k => /[CM]:/.test(k))) throw Error('Queue reply requires a Ctrl/Meta chord.');
        for (const other of bindings) {
          if (!overlaps(other.scope, scope)) continue;
          if (keys.slice(0, other.keys.length).join('\0') === other.keys.join('\0') || other.keys.slice(0, keys.length).join('\0') === keys.join('\0')) throw Error(label + ' conflicts with ' + actions[other.id][0] + ' (duplicate or prefix).');
        }
        bindings.push({id, scope, keys, notation:value});
      }
    }
    return bindings;
  }
  function eventKey(event) {
    const mods = [];
    if (event.altKey) mods.push('A');
    if (event.ctrlKey) mods.push('C');
    if (event.metaKey) mods.push('M');
    if (event.shiftKey && (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey)) mods.push('S');
    let key = event.key;
    if (mods.length && key.length === 1) key = key.toLowerCase();
    return [...mods, key].join(':');
  }
  function composerBinding(binding, mode, idle) {
    if (['back','forward'].includes(binding.id) && binding.keys.some(key=>['C:o','C:i'].includes(key))) return false;
    if (binding.id === 'normal' && binding.keys.every(key=>key.length===1)) return false;
    const chord = /^(?:[ACMS]:)+/.test(binding.keys[0]);
    if (binding.scope === 'global' || binding.id === 'send' || binding.id === 'normal') return true;
    if (binding.scope === 'windows' && chord) return true;
    if (mode !== 'normal' || !idle) return false;
    if (binding.id === 'reply' && binding.keys.length===1 && ['i','o','a'].includes(binding.keys[0])) return false;
    return ['windows','navigation','composerNormal'].includes(binding.scope);
  }
  const api = {actions, defaults, fallback, migrate, parse, compile, eventKey, activeScopes, composerBinding};
  if (typeof module !== 'undefined') module.exports = api;
  else root.Keymaps = api;
})(globalThis);
