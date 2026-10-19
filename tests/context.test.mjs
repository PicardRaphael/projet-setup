// Contexte chargé à chaque session : seuls CLAUDE.md, ses imports `@chemin` et les rules sans `paths:` comptent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inventory } from '../scripts/matt-setup.mjs';

function repo(t, files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'matt-context-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), body); }
  return dir;
}

test('imports de CLAUDE.md : en cascade, hors code ; liens et backticks non comptés', t => {
  const fence = '```';
  const dir = repo(t, {
    'CLAUDE.md': 'Voir @docs/a.md et [guide](docs/guide.md), `docs/b.md`, `@docs/b.md`.\n\n' + fence + '\n@docs/c.md\n' + fence + '\n',
    'docs/a.md': 'A importe @deep.md',
    'docs/deep.md': 'profond',
    'docs/guide.md': 'g'.repeat(4000),
    'docs/b.md': 'b',
    'docs/c.md': 'c',
  });
  const files = inventory(dir, os.tmpdir()).alwaysLoaded.files;
  assert.deepEqual(files.map(f => f.file).sort(), ['CLAUDE.md', 'docs/a.md', 'docs/deep.md']);
  assert.equal(files.find(f => f.file === 'docs/deep.md').importedBy, 'docs/a.md');
});

test('imports : 4 niveaux au plus et pas de boucle', t => {
  const dir = repo(t, {
    'CLAUDE.md': '@1.md',
    '1.md': '@2.md', '2.md': '@3.md', '3.md': '@4.md', '4.md': '@5.md', '5.md': 'trop loin @CLAUDE.md',
  });
  const files = inventory(dir, os.tmpdir()).alwaysLoaded.files.map(f => f.file).sort();
  assert.deepEqual(files, ['1.md', '2.md', '3.md', '4.md', 'CLAUDE.md']);
});
