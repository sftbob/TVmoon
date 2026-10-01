const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mergeUpstream } = require('./safe-upstream-merge.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvmoon-sync-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (name, text) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), text); };
  const commit = () => { git('add', '.'); git('commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  write('app.txt', 'original\n');
  const base = commit();
  git('update-ref', 'refs/remotes/origin/main', base);
  git('switch', '-c', 'sync/upstream');
  return { dir, git, write, commit, base };
}

test('rejects main and leaves its tip unchanged', t => {
  const f = fixture(t); f.git('switch', 'main');
  assert.throws(() => mergeUpstream(f.dir, 'main'), /Only sync/);
  assert.equal(f.git('rev-parse', 'main'), f.base);
});
test('unrelated history is rejected without changing either branch', t => {
  const f = fixture(t); f.git('switch', '--orphan', 'other');
  f.write('app.txt', 'unrelated\n'); const other = f.commit();
  f.git('switch', 'sync/upstream');
  assert.throws(() => mergeUpstream(f.dir, other), /No common history/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.base);
  assert.equal(f.git('rev-parse', 'main'), f.base);
});
test('merges upstream with personal changes and preserves ancestry', t => {
  const f = fixture(t); f.write('personal.txt', 'personal\n'); f.commit();
  f.git('switch', '-c', 'incoming', f.base); f.write('new.txt', 'upstream\n'); const incoming = f.commit();
  f.git('switch', 'sync/upstream');
  assert.equal(mergeUpstream(f.dir, incoming), true);
  assert.equal(fs.readFileSync(path.join(f.dir, 'personal.txt'), 'utf8'), 'personal\n');
  f.git('merge-base', '--is-ancestor', incoming, 'HEAD');
  assert.equal(f.git('rev-parse', 'main'), f.base);
  assert.equal(mergeUpstream(f.dir, incoming), false);
});
test('conflicts abort and retain original sync tip', t => {
  const f = fixture(t); f.write('app.txt', 'personal\n'); const personal = f.commit();
  f.git('switch', '-c', 'incoming', f.base); f.write('app.txt', 'upstream\n'); const incoming = f.commit();
  f.git('switch', 'sync/upstream');
  assert.throws(() => mergeUpstream(f.dir, incoming));
  assert.equal(f.git('rev-parse', 'HEAD'), personal);
  assert.equal(f.git('status', '--porcelain'), '');
});
test('automation changes require manual review', t => {
  const f = fixture(t); f.git('switch', '-c', 'incoming');
  f.write('.github/workflows/unsafe.yml', 'permissions: write-all\n'); const incoming = f.commit();
  f.git('switch', 'sync/upstream');
  assert.throws(() => mergeUpstream(f.dir, incoming), /automation/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.base);
  assert.equal(f.git('status', '--porcelain'), '');
});
test('stale sync branch cannot bypass newer main', t => {
  const f = fixture(t); f.git('switch', 'main'); f.write('main.txt', 'new main\n'); const main = f.commit();
  f.git('update-ref', 'refs/remotes/origin/main', main); f.git('switch', 'sync/upstream');
  assert.throws(() => mergeUpstream(f.dir, f.base), /current main/);
});
test('dirty working tree is rejected', t => {
  const f = fixture(t); f.write('app.txt', 'dirty\n');
  assert.throws(() => mergeUpstream(f.dir, f.base), /clean/);
});
test('previously synchronized upstream cannot be rewound', t => {
  const f = fixture(t); f.git('switch', '-c', 'incoming');
  f.write('new.txt', 'upstream\n'); const incoming = f.commit();
  f.git('switch', 'sync/upstream'); mergeUpstream(f.dir, incoming);
  const synced = f.git('rev-parse', 'HEAD');
  assert.throws(() => mergeUpstream(f.dir, f.base), /rewritten/);
  assert.equal(f.git('rev-parse', 'HEAD'), synced);
});
