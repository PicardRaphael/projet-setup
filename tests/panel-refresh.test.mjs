// Mise à jour : un bloc du panel écrit par une ancienne version est remplacé, le reste du skill ne bouge pas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { install, installPanel, upgrade } from '../scripts/matt-setup.mjs';

test('mise à jour : les blocs du panel d\'une ancienne version sont rafraîchis', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'matt-refresh-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main']);
  install(dir, 'socle', true);
  installPanel(dir, true);
  const file = path.join(dir, '.claude/skills/code-review/SKILL.md');
  const fresh = fs.readFileSync(file, 'utf8');
  const start = '<!-- matt-setup:panel:start -->';
  const end = '<!-- matt-setup:panel:end -->';
  const eol = fresh.includes('\r\n') ? '\r\n' : '\n';
  const old = fresh.slice(0, fresh.indexOf(start)) + start + eol + 'ancien bloc' + eol + fresh.slice(fresh.indexOf(end));
  fs.writeFileSync(file, old);
  assert.deepEqual(upgrade(dir).refreshedBlocks, ['code-review']);
  assert.equal(fs.readFileSync(file, 'utf8'), old, 'rien sans --apply');
  upgrade(dir, true);
  assert.equal(fs.readFileSync(file, 'utf8'), fresh);
  assert.deepEqual(upgrade(dir).refreshedBlocks, []);
});
