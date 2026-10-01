const { execFileSync } = require('node:child_process');
function mergeUpstream(cwd, source = 'refs/remotes/upstream/main') {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git('status', '--porcelain')) throw new Error('Working tree must be clean');
  if (git('branch', '--show-current') !== 'sync/upstream') throw new Error('Only sync/upstream may be updated');
  const base = git('rev-parse', 'HEAD');
  const incoming = git('rev-parse', source);
  try { git('merge-base', base, incoming); } catch { throw new Error('No common history; confirm upstream manually'); }
  const last = git('log', '--first-parent', '--format=%s', '--grep=^Merge upstream ', '-1').match(/^Merge upstream ([0-9a-f]{40}) for review$/);
  if (last) {
    try { git('merge-base', '--is-ancestor', last[1], incoming); }
    catch { throw new Error('Upstream history was rewritten; manual review required'); }
  }
  try { git('merge-base', '--is-ancestor', 'origin/main', base); } catch { throw new Error('Sync branch must contain current main'); }
  try { git('merge-base', '--is-ancestor', incoming, base); return false; } catch {}
  try {
    git('merge', '--no-ff', '--no-commit', incoming);
    if (git('diff', '--cached', '--name-only', '--', '.github/workflows', 'scripts/safe-upstream-merge.cjs', 'scripts/safe-upstream-merge.test.cjs')) throw new Error('Upstream changes automation; manual review required');
    git('commit', '-m', 'Merge upstream ' + incoming + ' for review');
    return true;
  } catch (error) {
    try { git('merge', '--abort'); } catch {}
    throw error;
  }
}
module.exports = { mergeUpstream };
if (require.main === module) {
  try { console.log(mergeUpstream(process.cwd()) ? 'Merged for review' : 'Already up to date'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
