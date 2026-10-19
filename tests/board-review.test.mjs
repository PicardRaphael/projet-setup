// Non-régression des défauts trouvés par la revue du tableau de bord.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { board, html, answer, markdown } from '../templates/board.mjs';

const BOARD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates/board.mjs');

function repo(t, files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'matt-board-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), body); }
  return dir;
}
const brief = dir => spawnSync(process.execPath, [BOARD, '--brief'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });

test('entrées parasites : un dossier en .md ou un fichier « issues » ne cassent ni le suivi ni le résumé', t => {
  const dir = repo(t, { '.scratch/a/issues/01-ok.md': '# Ok\n\n**Status:** needs-info\n', '.scratch/b/issues': 'pas un dossier' });
  fs.mkdirSync(path.join(dir, '.scratch/a/issues/02-dossier.md'));
  const out = brief(dir);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /a\/01 Ok \[needs-info\]/);
});

test('champs : valeur vide, phrase « Status: » dans le corps, numéros #1 et statut blocked', t => {
  const dir = repo(t, {
    '.scratch/f/issues/01-a.md': '# A\n\n**Status:** done\n',
    '.scratch/f/issues/02-b.md': '# B\n\n**Status:** \n**Blocked by:** #1\n\n## Notes\n\nStatus: resolved était faux.\n',
    '.scratch/f/issues/03-c.md': '# C\n\n**Status:** blocked\n',
    '.scratch/f/issues/04-d.md': '# D\n\n**Status:** needs-info (voir question)\n',
  });
  const [f] = board(dir);
  const [, b, c, d] = f.tickets;
  assert.equal(b.status, 'open');
  assert.deepEqual([b.blockedBy, b.waitingOn, b.state], [['1'], [], 'ready']);
  assert.equal(c.state, 'blocked');
  assert.equal(d.state, 'human');
  assert.match(html(board(dir), dir), /Status: resolved était faux\./, 'la phrase du corps reste visible');
});

test('réponse : « $ » non interprété, insérée sous Comments même suivi d\'une autre section', t => {
  const dir = repo(t, { '.scratch/f/issues/01-q.md': '# Q\n\n**Status:** needs-info\n\n## Comments\n\nQuestion ?\n\n## Notes\n\nfin\n' });
  answer(dir, '.scratch/f/issues/01-q.md', "prix 5$` et $& et $'");
  const text = fs.readFileSync(path.join(dir, '.scratch/f/issues/01-q.md'), 'utf8');
  assert.match(text, /Question \?\n\n- \d{4}-\d\d-\d\d, réponse humaine \(depuis le tableau de bord\) :\n  > prix 5\$` et \$& et \$'\n\n## Notes\n\nfin\n$/);
  assert.equal((text.match(/\*\*Status:\*\*/g) || []).length, 1);
});

test('réponse : une jonction dans .scratch ne permet pas d\'écrire hors de .scratch', t => {
  const dir = repo(t, { '.scratch/f/issues/01-q.md': '# Q\n\n**Status:** needs-info\n', 'README.md': '**Status:** needs-info\n' });
  fs.symlinkSync(dir, path.join(dir, '.scratch/out'), 'junction');
  assert.throws(() => answer(dir, '.scratch/out/README.md', 'x'), /introuvable/);
  assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), '**Status:** needs-info\n');
});

test('rendu : liens //, code protégé, citations des réponses', () => {
  assert.doesNotMatch(markdown('[x](//evil.example)'), /href/);
  assert.match(markdown('[spec](./spec.md)'), /href=".\/spec.md"/);
  assert.match(markdown('`**pas gras** [l](https://a.b)`'), /<code>\*\*pas gras\*\* \[l\]\(https:\/\/a.b\)<\/code>/);
  assert.match(markdown('- réponse :\n  > Option A.\n  > Division vraie.'), /<\/ul><blockquote>Option A\.<br>Division vraie\.<\/blockquote>/);
});

test('résumé de démarrage plafonné', t => {
  const files = {};
  for (let i = 1; i <= 7; i++) files['.scratch/f' + i + '/issues/01-x.md'] = '# X' + i + '\n\n**Status:** needs-info\n';
  const out = brief(repo(t, files)).stdout;
  assert.match(out, /\+2 autres/);
  assert.match(out, /- \+3 autres chantiers/);
  assert.ok(out.split('\n').length <= 9);
});

test('serveur : état léger, hôte en majuscules accepté, erreur de lecture sans arrêt du serveur', async t => {
  const dir = repo(t, { '.scratch/f/issues/01-q.md': '# Q\n\n**Status:** needs-info\n' });
  const port = 4600 + Math.floor(Math.random() * 300);
  const server = spawn(process.execPath, [BOARD, '--serve', String(port)], { env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  t.after(() => server.kill());
  await new Promise(resolve => server.stdout.once('data', resolve));
  const get = (url, host = '127.0.0.1:' + port) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: url, headers: { host } }, res => { let b = ''; res.on('data', d => (b += d)).on('end', () => resolve({ code: res.statusCode, body: b })); }).on('error', reject));
  const first = await get('/state');
  assert.match(first.body, /^[0-9a-f]{40}$/);
  assert.equal((await get('/state')).body, first.body, 'stable sans changement');
  fs.appendFileSync(path.join(dir, '.scratch/f/issues/01-q.md'), 'modifié\n');
  assert.notEqual((await get('/state')).body, first.body);
  assert.equal((await get('/', 'LOCALHOST:' + port)).code, 200);
  fs.mkdirSync(path.join(dir, '.scratch/f/issues/02-dossier.md'));
  assert.equal((await get('/')).code, 200);
});
