const projects = [
  { id: 'p1', name: 'Jetstream' },
  { id: 'p2', name: 'Field Notes' },
  { id: 'p3', name: 'Observatory' }
];
const captains = [
  {id:'c1',projectId:'p1',code:'JET-C1',title:'Release captain',status:'idle',isCaptain:true},
  {id:'c2',projectId:'p3',code:'OBS-C1',title:'Observatory captain',status:'working',isCaptain:true}
];
const threads = [
  { id: 't1', code: 'JET-104', title: 'Tighten the release checklist', status: 'working' },
  { id: 't2', code: 'JET-103', title: 'Review the command palette', status: 'idle' },
  { id: 't3', code: 'JET-102', title: 'Add an offline empty state', status: 'idle' },
  { id: 't4', code: 'JET-101', title: 'Clean up onboarding copy', status: 'idle' }
];
for (const item of threads) item.projectId = 'p1';
threads.push({id:'t6',projectId:'p3',parentId:'c2',code:'OBS-12',title:'Check the nightly signal',status:'idle',activityMinutes:18});
threads.push({id:'t5',projectId:'p1',code:'JET-100',title:'Pick a versioning scheme',status:'idle',activityMinutes:50});
const entries = [
  { source: 'user', text: 'Can we make the release checklist shorter? Keep the steps that catch real problems.', createdAt: '2026-11-20T17:12:00Z' },
  { source: 'assistant', text: 'I’d keep three checks: run the smoke tests, open the packaged app, and confirm the rollback steps. The build already checks formatting and types.', createdAt: '2026-11-20T17:13:00Z' },
  { source: 'user', text: 'Good. Put the packaged-app check first, and make the rollback step easy to find.', createdAt: '2026-11-20T17:15:00Z' },
  { id:'rich-demo', source:'assistant', createdAt:'2026-11-20T17:16:00Z', text: [
    '## Release readiness',
    'Keep the **three checks** that catch real problems. The packaged app comes first.',
    '| Check | What it catches |\n| --- | --- |\n| Packaged app | Missing assets and startup errors |\n| Smoke tests | Broken navigation and replies |\n| Rollback | An unclear recovery path |',
    '> Stop the release if any check fails. Keep the last known-good build.',
    '1. Open the packaged app.\n2. Run `npm run smoke`.\n3. Confirm the rollback steps.',
    '```sh\nnpm ci\nnpm run smoke\n```',
    '### Release path',
    '```mermaid\nflowchart LR\n  Build --> Package\n  Package --> Smoke\n  Smoke --> Ready\n```',
    '### Packaged preview',
    '![Local sample: release checklist](demo:release-preview)',
    '*Sample data, fully offline.* [API documentation](https://docs.capy.ai/api-reference/overview) is available in live mode.'
  ].join('\n\n'), attachments:[
    {file:{fileId:'demo-image',name:'release-preview.png',mediaType:'image/png',sizeBytes:40000,sourcePath:'demo:release-preview'},title:'Release checklist preview'},
    {file:{fileId:'demo-checklist',name:'release-checklist.txt',mediaType:'text/plain',sizeBytes:90},title:'Release checklist · text copy'}
  ] }
];

function demo() {
  const replies = new Map();
  const activity = [
    { id:'run-1', threadId:'t1', kind:'running', title:threads[0].title, detail:'Checking the packaged app before updating the release steps.', minutes:2 },
    { id:'ask-1', threadId:'t2', kind:'needs', title:threads[1].title, detail:'Pick a default: search all projects or start in the current project?', minutes:8 },
    { id:'done-1', threadId:'t3', kind:'results', title:threads[2].title, detail:'Added a disconnected screen and a retry action. Smoke tests passed.', minutes:12 },
    { id:'done-2', threadId:'t4', kind:'results', title:threads[3].title, detail:'Shortened the welcome copy and clarified where API keys are stored.', minutes:24 },
    { id:'done-3', threadId:'t3', kind:'results', title:threads[2].title, detail:'First pass: mapped the loading, offline, and empty-project states.', minutes:38 },
    { id:'done-4', threadId:'t6', kind:'results', title:threads[4].title, detail:'Checked the nightly signal. No missing observations in the sample window.', minutes:18 }
  ];
  return {
    activity: () => ({ threads, captains, projects, activity }),
    projects: () => ({ items: projects }),
    threads: (id, cursor) => ({
      items: id === 'p1' && cursor ? threads.filter(item => item.id === 't5') : [...threads, ...captains].filter(item => item.projectId === id && item.id !== 't5'),
      cursor: id === 'p1' && !cursor ? 'older-threads' : null
    }),
    messages: (id, query) => { const before=typeof query==='string'?query:query?.before; return ({
      items: before ? [{ source: 'assistant', text: 'The first pass at the release checklist is ready.', createdAt: '2026-11-20T17:10:00Z' }] :
        [...(id === 't1' ? entries : captains.some(item => item.id === id) ? [{source:'assistant',text:'Captain context: ' + captains.find(item => item.id === id).title + '. Sample coordination conversation; visiting this context records a session visit.'}] : activity.filter(item => item.threadId === id).slice().reverse().map(item => ({
          id:item.id, source:'assistant', text:item.detail, createdAt:new Date(Date.now() - item.minutes * 60000).toISOString()
        }))), ...(replies.get(id) ?? [])],
      beforeCursor: id === 't1' && !before ? 'older-messages' : null
    }); },
    send: (id, text, clientKey) => {
      const prior=(replies.get(id)||[]).find(item=>item.clientKey===clientKey);
      if(prior)return {id:prior.id,deduped:true};
      const messageId=require('node:crypto').randomBytes(13).toString('hex');
      replies.set(id, [...(replies.get(id) ?? []), {id:messageId,clientKey, source: 'user', text, createdAt: new Date().toISOString() }]);
      return {id:messageId,deduped:false};
    }
  };
}
module.exports = { demo };
