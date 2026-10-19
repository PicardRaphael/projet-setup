// Mémoire des agents du panel : écriture limitée à leur dossier, hook branché par install-panel, taille surveillée.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { install, installPanel, inventory } from '../scripts/matt-setup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function repo(t, files = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'matt-memory-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main']);
  for (const [file, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), body); }
  return dir;
}
const guard = (dir, agent, file) => spawnSync(process.execPath, [path.join(ROOT, 'templates/hooks/memory-guard.mjs'), 'security-reviewer', 'approver'], {
  input: JSON.stringify({ agent_type: agent, tool_name: 'Write', tool_input: { file_path: file } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
});

test('garde de mémoire : un agent du panel n\'écrit que dans sa propre mémoire', t => {
  const dir = repo(t);
  assert.equal(guard(dir, 'security-reviewer', path.join(dir, '.claude/agent-memory/security-reviewer/MEMORY.md')).status, 0);
  assert.equal(guard(dir, 'security-reviewer', path.join(dir, 'src/x.ts')).status, 2);
  assert.match(guard(dir, 'security-reviewer', path.join(dir, 'src/x.ts')).stderr, /que dans sa mémoire/);
  assert.equal(guard(dir, 'security-reviewer', path.join(dir, '.claude/agent-memory/approver/MEMORY.md')).status, 2, 'pas la mémoire d\'un autre');
  assert.equal(guard(dir, 'security-reviewer', path.join(dir, '.claude/agent-memory/security-reviewer/../../settings.json')).status, 2, 'pas d\'évasion par ..');
  assert.equal(guard(dir, 'general-purpose', path.join(dir, 'src/x.ts')).status, 0, 'les implémenteurs ne sont pas concernés');
  assert.equal(guard(dir, undefined, path.join(dir, 'src/x.ts')).status, 0, 'la session principale non plus');
});

test('install-panel branche le garde dans settings.json sans toucher au reste, une seule fois', t => {
  const dir = repo(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./.env)'] }, hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'fmt' }] }] } }) });
  install(dir, 'socle', true);
  assert.equal(installPanel(dir).memoryGuard.state, 'add');
  installPanel(dir, true);
  installPanel(dir, true);
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(settings.permissions.deny, ['Read(./.env)']);
  assert.equal(settings.hooks.PostToolUse[0].hooks[0].command, 'fmt');
  const guards = settings.hooks.PreToolUse.flatMap(g => g.hooks).filter(h => h.command.includes('memory-guard.mjs'));
  assert.equal(guards.length, 1);
  assert.match(guards[0].command, /plan-challenger.*security-reviewer|security-reviewer.*plan-challenger/);
  assert.ok(fs.existsSync(path.join(dir, '.claude/hooks/memory-guard.mjs')));
  assert.equal(installPanel(dir).memoryGuard.state, 'same');
});

test('agents du panel : mémoire de projet et consigne de taille', () => {
  for (const name of ['plan-challenger', 'security-reviewer', 'ui-reviewer', 'approver', 'internal-researcher']) {
    const text = fs.readFileSync(path.join(ROOT, 'templates/agents', name + '.md'), 'utf8');
    assert.match(text, /^memory: project$/m, name);
    assert.match(text, /30 lines at most/, name);
    assert.match(text, /## Lesson/, name);
  }
});

test('inventaire : signale une mémoire d\'agent trop longue', t => {
  const dir = repo(t, {
    '.claude/agent-memory/approver/MEMORY.md': Array.from({ length: 40 }, (_, i) => '- leçon ' + i).join('\n'),
    '.claude/agent-memory/ui-reviewer/MEMORY.md': '- une leçon\n',
  });
  const mem = inventory(dir, os.tmpdir()).agentMemory;
  assert.deepEqual(mem.map(m => [m.agent, m.lines, m.overLimit]).sort(), [['approver', 40, true], ['ui-reviewer', 1, false]]);
});
