const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Connection } = require('./connection.cjs');
const fixture = 'capy_' + 'x'.repeat(43), replacement = 'capy_' + 'y'.repeat(43);
const secret = crypto.randomBytes(32);
const storage = {
  isEncryptionAvailable: () => true,
  encryptString(text) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
    const bytes = Buffer.concat([cipher.update(text), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
  },
  decryptString(bytes) {
    const cipher = crypto.createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString();
  }
};
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-credential-unit-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let calls = 0, reject = false;
  const make = (options = {}) => new Connection({ directory, storage, validate: async key => { calls++; if (reject || ![fixture, replacement].includes(key)) throw Error('Rejected fixture'); }, ...options });
  return { directory, make, calls: () => calls, reject: value => reject = value };
}
test('adapter encryption, permissions, restart and dormant mock never validate a saved key', async t => {
  const f = await setup(t), c = f.make(); await c.start(); await c.connect(fixture);
  for (const name of await fs.readdir(f.directory)) {
    const bytes = await fs.readFile(path.join(f.directory, name));
    assert.equal(bytes.includes(fixture), false);
    assert.equal((await fs.stat(path.join(f.directory, name))).mode & 0o777, 0o600);
  }
  const restart = f.make(); assert.equal((await restart.start()).connected, true); assert.equal(restart.key, fixture);
  await restart.mode('mock'); const count = f.calls();
  const dormant = f.make(); assert.equal((await dormant.start()).demo, true); assert.equal(f.calls(), count); assert.equal(dormant.key, '');
  await dormant.mode('live'); assert.equal(dormant.key, fixture);
  assert.equal(JSON.stringify(dormant.status()).includes(fixture), false);
});
test('invalid and rejected replacement preserve valid ciphertext and connection', async t => {
  const f = await setup(t), c = f.make(); await c.start(); await c.connect(fixture);
  const bytes = await fs.readFile(path.join(f.directory, 'credential.bin'));
  await assert.rejects(c.connect('bad'), /valid/); f.reject(true);
  await assert.rejects(c.connect(replacement), /Previous connection/);
  assert.equal(c.key, fixture); assert.deepEqual(await fs.readFile(path.join(f.directory, 'credential.bin')), bytes);
});
test('unavailable secure storage is session-only; corrupt/revoked key has reconnect and forget recovery', async t => {
  const f = await setup(t), c = f.make({ storage: { isEncryptionAvailable: () => false } });
  await c.start(); assert.match((await c.connect(fixture)).warning, /session only/);
  await assert.rejects(fs.stat(path.join(f.directory, 'credential.bin')), { code: 'ENOENT' });
  const saved = f.make(); await saved.start(); await saved.connect(fixture);
  f.reject(true); const revoked = f.make(); assert.equal((await revoked.start()).connected, false); assert.match(revoked.warning, /Reconnect/);
  f.reject(false); await fs.writeFile(path.join(f.directory, 'credential.bin'), 'corrupt fixture');
  const corrupt = f.make(); assert.equal((await corrupt.start()).connected, false); assert.match(corrupt.warning, /Reconnect/);
  await corrupt.forget(); assert.equal(corrupt.demo, true); assert.equal(corrupt.saved, false); assert.match(corrupt.warning, /does not revoke/);
  await assert.rejects(fs.stat(path.join(f.directory, 'credential.bin')), { code: 'ENOENT' });
});
test('flags and environment precedence do not accidentally persist an environment credential', async t => {
  const f = await setup(t), c = f.make(); await c.start(); await c.connect(fixture); await c.mode('mock');
  const count = f.calls(); const demo = f.make({ environment: replacement, flags: ['--live', '--demo'] }); await demo.start(); assert.equal(demo.demo, true); assert.equal(f.calls(), count);
  const env = f.make({ environment: replacement }); await env.start(); assert.equal(env.key, replacement);
  assert.equal(await f.make().read().catch(() => ''), '');
  const restored = f.make({ flags: ['--live'] }); await restored.start(); assert.equal(restored.key, fixture);
  await restored.mode('mock'); f.reject(true); await assert.rejects(restored.mode('live'), /Current mode was kept/); assert.equal(restored.demo, true);
});
test('send/create lock and concurrent transitions never replay a write', async t => {
  const f = await setup(t), c = f.make(); await c.start(); await c.connect(fixture);
  c.activeWrites++; await assert.rejects(c.mode('mock'), /active send/); await assert.rejects(c.forget(), /active send/); await assert.rejects(c.connect(replacement), /active send/); c.activeWrites--;
  const first = c.mode('mock'); await assert.rejects(c.mode('live'), /connection change/); await first;
  assert.equal(c.demo, true);
});
