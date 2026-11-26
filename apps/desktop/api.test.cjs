const assert = require('node:assert/strict');
const test = require('node:test');
const { api } = require('./api.cjs');

test('uses the documented paths, pagination, and queue delivery', async () => {
  const calls = [];
  const client = api('fixture', async (url, init) => {
    calls.push([url.href, init]);
    return Response.json({});
  });
  await client.projects();
  await client.threads('p1', 'page+1');
  await client.messages('t1', 'earlier');
  await client.send('t1', 'hello', 'fixture-id');
  await client.messages('t1', {after:'next+page'});
  assert.deepEqual(calls.map(([url, init]) => [url.replace('https://api.capy.ai/api/v1/', ''), init.method]), [
    ['projects', 'GET'], ['threads?projectId=p1&cursor=page%2B1&limit=30', 'GET'],
    ['threads/t1/messages?before=earlier&limit=30', 'GET'], ['threads/t1/message', 'POST'],
    ['threads/t1/messages?after=next%2Bpage&limit=30','GET']
  ]);
  assert.equal(calls[3][1].headers.Authorization, 'Bearer fixture');
  assert.equal(calls[3][1].redirect, 'error');
  assert.deepEqual(JSON.parse(calls[3][1].body), { text:'hello', delivery:'queue', clientKey:'fixture-id' });
});

test('rejects invalid IDs and keeps response payloads out of errors', async () => {
  const client = api('fixture', async () => new Response('private content', { status:401 }));
  assert.throws(() => client.messages('../projects'), /Invalid thread ID/);
  await assert.rejects(client.projects(), { message:'Capy API returned HTTP 401.' });
});
