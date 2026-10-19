import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { catalog, inventory, install, status, upgrade, acceptAdaptation, retire, installTemplates, installPanel, TEMPLATES, PANEL } from '../scripts/matt-setup.mjs';
import { board, html, answer, markdown } from '../templates/board.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };

function tmp(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'matt-setup-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function repo(t, files = {}) {
  const dir = path.join(tmp(t), 'repo');
  fs.mkdirSync(dir);
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { env, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  for (const [file, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), body); }
  if (Object.keys(files).length) { git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@e.invalid', 'commit', '-qm', 'init'); }
  return dir;
}
const skill = (name, body = 'Procédure maison') => '---\nname: ' + name + '\ndescription: ' + name + ' du repo\n---\n\n' + body + '\n';

test('le snapshot contient les 27 skills publiés avec leur licence', () => {
  const list = catalog();
  assert.equal(list.length, 27);
  for (const s of list) {
    assert.equal(s.name, path.basename(s.path));
    assert.ok(fs.existsSync(path.join(s.dir, 'LICENSE.mattpocock')), s.name);
    assert.ok(fs.existsSync(path.join(s.dir, 'agents/openai.yaml')), s.name);
  }
  assert.equal(list.filter(s => s.disableModelInvocation).length, 16);
});

test('repo neuf : inventaire vide puis installation des 27 skills versionnables', t => {
  const dir = repo(t);
  const inv = inventory(dir, tmp(t));
  assert.equal(inv.empty, true);
  assert.equal(inv.matt, null);
  const plan = install(dir, 'all');
  assert.equal(plan.applied, false);
  assert.equal(plan.add.length, 27);
  assert.equal(fs.existsSync(path.join(dir, '.claude')), false, 'sans --apply rien n\'est écrit');
  install(dir, 'all', true);
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/to-spec/SKILL.md')));
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/diagnosing-bugs/scripts/hitl-loop.template.sh')));
  const st = status(dir);
  assert.equal(st.skills.length, 27);
  assert.ok(st.skills.every(s => s.state === 'pristine' && !s.updateAvailable));
  assert.equal(install(dir, 'all', true).add.length, 0, 'réinstallation idempotente');
});

test('profils : le socle tire ses dépendances, aucune brique appelée ne manque', async t => {
  const dir = repo(t);
  const plan = install(dir, 'socle');
  assert.equal(plan.add.length, 15);
  assert.deepEqual(plan.addedAsDependency, []);
  const wayfinder = install(dir, 'wayfinder');
  assert.deepEqual(wayfinder.addedAsDependency.sort(), ['domain-modeling', 'grilling', 'prototype', 'research']);
  install(dir, 'socle', true);
  let st = status(dir);
  assert.deepEqual(st.brokenCalls, []);
  assert.throws(() => retire(dir, '.claude/skills/tdd', '.claude/skills/tdd', true), /appelé par implement/);
  fs.rmSync(path.join(dir, '.claude/skills/codebase-design'), { recursive: true });
  st = status(dir);
  assert.deepEqual(st.brokenCalls, ['tdd → codebase-design']);
  const all = new Set(catalog().map(s => s.name));
  const { DEPENDENCIES, PROFILES } = await import('../scripts/matt-setup.mjs');
  for (const [name, deps] of Object.entries(DEPENDENCIES)) for (const n of [name, ...deps]) assert.ok(all.has(n), n);
  assert.deepEqual([...new Set(Object.values(PROFILES).flat())].sort(), [...all].sort(), 'chaque skill du snapshot appartient à un profil');
});

test('repo existant : inventaire des composants et conflit de nom sans écrasement', t => {
  const dir = repo(t, {
    'CLAUDE.md': '# Projet\n\n## Agent skills\n',
    '.claude/skills/to-spec/SKILL.md': skill('to-spec', 'Format de spec maison'),
    '.claude/skills/langfuse/SKILL.md': skill('langfuse'),
    '.claude/agents/reviewer.md': '---\nname: company-reviewer\ndescription: Relecteur\n---\n',
    '.claude/settings.json': JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'npm run lint' }] }] }, permissions: { deny: ['Read(./.env)'] } }),
    'package.json': JSON.stringify({ scripts: { test: 'vitest', typecheck: 'tsc --noEmit' } }),
    'tsconfig.json': '{}',
  });
  const home = tmp(t);
  fs.mkdirSync(path.join(home, '.claude/skills/tdd'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/skills/tdd/SKILL.md'), skill('tdd'));
  const inv = inventory(dir, home);
  assert.equal(inv.empty, false);
  assert.deepEqual(inv.skills.map(s => [s.dir, s.sameNameAsMatt, s.tracked]).sort(), [['langfuse', false, true], ['to-spec', true, true]]);
  assert.deepEqual(inv.personalSkillsShadowingMatt, ['tdd']);
  assert.equal(inv.agents[0].name, 'company-reviewer');
  assert.deepEqual(inv.settings.project.hooks.PostToolUse[0].commands, ['npm run lint']);
  assert.equal(inv.instructions[0].hasAgentSkillsSection, true);
  assert.deepEqual(inv.stack.languages, ['typescript']);
  assert.equal(inv.stack.scripts.typecheck, 'tsc --noEmit');

  const result = install(dir, 'all', true);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].skill, 'to-spec');
  assert.match(fs.readFileSync(path.join(dir, '.claude/skills/to-spec/SKILL.md'), 'utf8'), /Format de spec maison/);
  assert.equal(result.add.length, 26);
});

test('adaptation détectée, mise à jour des skills intacts, fusion des skills adaptés', t => {
  const dir = repo(t);
  install(dir, 'to-spec,tdd,grill-me', true);
  fs.appendFileSync(path.join(dir, '.claude/skills/to-spec/SKILL.md'), '\n## Repo conventions\nSections en français.\n');
  let st = status(dir);
  assert.deepEqual(st.skills.find(s => s.name === 'to-spec'), { name: 'to-spec', state: 'adapted', changed: ['SKILL.md'], updateAvailable: false, removedUpstream: false });

  // Simule un snapshot plus ancien au moment de l'installation : le lock garde d'autres hashes.
  const lockFile = path.join(dir, '.claude/matt-skills.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  for (const name of ['to-spec', 'tdd']) lock.skills[name].files['SKILL.md'] = 'ancien';
  fs.writeFileSync(lockFile, JSON.stringify(lock));
  fs.writeFileSync(path.join(dir, '.claude/skills/tdd/SKILL.md'), 'ancien contenu amont');
  // tdd : contenu = hash « ancien » impossible à reproduire ; on aligne le lock sur le fichier pour le marquer intact.
  lock.skills.tdd.files['SKILL.md'] = crypto.createHash('sha256').update('ancien contenu amont').digest('hex');
  fs.writeFileSync(lockFile, JSON.stringify(lock));

  st = status(dir);
  assert.equal(st.skills.find(s => s.name === 'tdd').state, 'pristine');
  assert.equal(st.skills.find(s => s.name === 'tdd').updateAvailable, true);
  const plan = upgrade(dir, true);
  assert.deepEqual(plan.replace, ['tdd']);
  assert.deepEqual(plan.merge.map(m => m.name), ['to-spec']);
  assert.notEqual(fs.readFileSync(path.join(dir, '.claude/skills/tdd/SKILL.md'), 'utf8'), 'ancien contenu amont');
  assert.match(fs.readFileSync(path.join(dir, '.claude/skills/to-spec/SKILL.md'), 'utf8'), /Sections en français/, 'la copie adaptée n\'est jamais écrasée');
  acceptAdaptation(dir, 'to-spec');
  st = status(dir);
  assert.equal(st.skills.find(s => s.name === 'to-spec').state, 'adapted');
  assert.equal(st.skills.find(s => s.name === 'to-spec').updateAvailable, false);
});

test('archivage : confirmation exacte, git mv pour un fichier suivi, déplacement simple sinon', t => {
  const dir = repo(t, { '.claude/skills/old-spec/SKILL.md': skill('old-spec') });
  fs.mkdirSync(path.join(dir, '.claude/skills/scratch-skill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude/skills/scratch-skill/SKILL.md'), skill('scratch-skill'));
  assert.throws(() => retire(dir, '.claude/skills/old-spec', '.claude/skills/autre', true), /Confirmer/);
  assert.throws(() => retire(dir, 'src', 'src', true), /limité/);
  assert.throws(() => retire(dir, '.claude/skills/../../x', '.claude/skills/../../x', true), /limité/);
  const preview = retire(dir, '.claude/skills/old-spec', '.claude/skills/old-spec');
  assert.equal(preview.applied, false);
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/old-spec')));
  const done = retire(dir, '.claude/skills/old-spec', '.claude/skills/old-spec', true);
  assert.equal(done.tracked, true);
  assert.ok(fs.existsSync(path.join(dir, done.to, 'SKILL.md')));
  assert.match(execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }), /^R/m);
  const untracked = retire(dir, '.claude/skills/scratch-skill', '.claude/skills/scratch-skill', true);
  assert.equal(untracked.tracked, false);
  assert.ok(fs.existsSync(path.join(dir, untracked.to, 'SKILL.md')));
  assert.equal(inventory(dir, tmp(t)).skills.length, 0, 'les archives ne sont plus chargées comme skills');
});

test('suivi : statut, dépendances et reprise depuis le tracker local de Matt', t => {
  const dir = repo(t, {
    '.scratch/messages/spec.md': '# Chargement des messages\n',
    '.scratch/messages/issues/01-api.md': '# API paginée\nStatus: resolved\n',
    '.scratch/messages/issues/02-ui.md': '# Liste infinie\nStatus: claimed\nBlocked by: 01\n',
    '.scratch/messages/issues/03-cache.md': '# Cache\nStatus: ready-for-agent\nBlocked by: 02\n',
    '.scratch/messages/issues/04-docs.md': '# Docs\n\n**Status:** ready-for-agent\n**Blocked by:** none\n',
    '.scratch/messages/issues/05-wording.md': '# Libellé du bouton\n\n**Status:** needs-info\n\n## Comments\n\nQuestion : « Exporter » ou « Télécharger » ?\n',
  });
  const [feature] = board(dir);
  assert.deepEqual(feature.tickets.map(x => [x.number, x.state]), [['01', 'done'], ['02', 'active'], ['03', 'blocked'], ['04', 'ready'], ['05', 'human']]);
  assert.deepEqual(feature.counts, { human: 1, done: 1, active: 1, ready: 1, blocked: 1 });
  assert.equal(installTemplates(dir, 'board', true).templates[0].state, 'add');
  const brief = spawnSync(process.execPath, [path.join(dir, '.claude/matt/board.mjs'), '--brief'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  assert.equal(brief.status, 0);
  assert.match(brief.stdout, /^À traiter en premier, une personne doit répondre ou agir : messages\/05 Libellé du bouton \[needs-info\]/);
  assert.match(brief.stdout, /messages : 1\/5 terminés ; suivants : 02 Liste infinie \[active\] ; 04 Docs \[ready\]/);
  assert.match(html(board(dir), dir), /Attend un humain[\s\S]*Libellé du bouton/);
  const empty = spawnSync(process.execPath, [path.join(ROOT, 'templates/board.mjs'), '--brief'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo(t) } });
  assert.equal(empty.stdout, '', 'aucune sortie sans travail ouvert');
});

test('hook : commande lancée sur le fichier édité, chemin avec espace', t => {
  const dir = repo(t);
  const hook = (script, args, file) => spawnSync(process.execPath, [path.join(ROOT, 'templates/hooks', script), ...args], { input: JSON.stringify({ tool_input: { file_path: path.join(dir, file) } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  const marker = path.join(dir, 'formatted.txt');
  const formatter = path.join(dir, 'fmt.mjs');
  fs.writeFileSync(formatter, 'import fs from "node:fs"; fs.writeFileSync(' + JSON.stringify(marker) + ', process.argv.at(-1));');
  assert.equal(hook('on-edit.mjs', ['node', formatter], 'src/a b.ts').status, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), path.join(dir, 'src/a b.ts'));
});

test('hook bons outils : refuse npm dans un repo pnpm, laisse passer le reste', t => {
  const run = command => spawnSync(process.execPath, [path.join(ROOT, 'templates/hooks/use-cli.mjs'), 'npm=pnpm', 'npx=pnpm dlx'], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' });
  assert.equal(run('npm install').status, 2);
  assert.match(run('npm install').stderr, /utilise `pnpm`/);
  assert.equal(run('git status && npx vitest').status, 2);
  assert.equal(run('pnpm install').status, 0);
  assert.equal(run('echo npm-is-a-word').status, 0);
  assert.equal(run('cat docs/npm.md').status, 0);
});

test('projet Python : uv détecté avec ses outils, et le hook impose uv', t => {
  const dir = repo(t, {
    'pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n\n[dependency-groups]\ndev = ["pytest", "ruff", "mypy"]\n\n[tool.ruff]\nline-length = 100\n',
    'uv.lock': 'version = 1\n',
  });
  const inv = inventory(dir, tmp(t));
  assert.deepEqual(inv.stack.languages, ['python']);
  assert.equal(inv.stack.python.manager, 'uv');
  assert.deepEqual(inv.stack.python.tools, ['pytest', 'ruff', 'mypy']);
  assert.ok(inv.stack.formatters.includes('ruff'));
  const poetry = repo(t, { 'pyproject.toml': '[tool.poetry]\nname = "x"\n', 'poetry.lock': '' });
  assert.equal(inventory(poetry, tmp(t)).stack.python.manager, 'poetry');
  const run = command => spawnSync(process.execPath, [path.join(ROOT, 'templates/hooks/use-cli.mjs'), 'pip=uv add (ou uv pip)', 'pytest=uv run pytest'], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' });
  assert.equal(run('pip install requests').status, 2);
  assert.match(run('pytest -q').stderr, /`uv run pytest`/);
  assert.equal(run('uv run pytest -q').status, 0);
  assert.equal(run('uv pip install requests').status, 0);
});

test('sync-upstream : le snapshot correspond au clone local de Matt', { skip: !fs.existsSync(path.join(ROOT, '../mattpocock-skills/.claude-plugin')) }, async () => {
  const { sync } = await import('../scripts/sync-upstream.mjs');
  const report = sync(path.join(ROOT, '../mattpocock-skills'));
  assert.equal(report.applied, false);
  assert.deepEqual([report.added, report.removed, report.changed], [[], [], []]);
});

test('inventaire : SDK d\'IA détectés pour proposer claude-api ou Langfuse', t => {
  const js = repo(t, { 'package.json': JSON.stringify({ dependencies: { '@anthropic-ai/sdk': '^1.0.0', langfuse: '^3.0.0', ai: '^5.0.0' } }) });
  assert.deepEqual(inventory(js, tmp(t)).stack.ai, ['anthropic', 'vercel-ai', 'langfuse']);
  const py = repo(t, { 'pyproject.toml': '[project]\ndependencies = ["anthropic>=0.40", "openai"]\n', 'uv.lock': '' });
  assert.deepEqual(inventory(py, tmp(t)).stack.ai, ['anthropic', 'openai']);
});

test('fins de ligne : un skill réécrit en CRLF ou en LF reste intact', t => {
  const dir = repo(t);
  install(dir, 'grill-me', true);
  for (const name of ['grill-me', 'grilling']) {
    const file = path.join(dir, '.claude/skills', name, 'SKILL.md');
    const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(file, name === 'grill-me' ? text.replace(/\n/g, '\r\n') : text);
  }
  assert.ok(status(dir).skills.every(s => s.state === 'pristine' && !s.updateAvailable));
});

test('tableau de bord : Markdown des tickets rendu proprement et échappé', async () => {
  const { markdown } = await import('../templates/board.mjs');
  const out = markdown('## What to build\n\nUne **fonction** `divide(a, b)`.\n\n- [ ] testée\n- [x] spec lue\n1. un\n2. deux\n\n```py\nx = 1 < 2\n```\n<script>alert(1)</script>');
  assert.match(out, /<h4>What to build<\/h4>/);
  assert.match(out, /<strong>fonction<\/strong> <code>divide\(a, b\)<\/code>/);
  assert.match(out, /<ul><li><input type="checkbox" disabled> testée<\/li><li><input type="checkbox" disabled checked> spec lue<\/li><\/ul><ol>/);
  assert.match(out, /<pre><code>x = 1 &lt; 2<\/code><\/pre>/);
  assert.doesNotMatch(out, /<script>/);
});

test('archivage : signale un skill du repo encore cité par une autre', t => {
  const dir = repo(t, { '.claude/skills/langfuse-trace/SKILL.md': skill('langfuse-trace') });
  install(dir, 'diagnosing-bugs', true);
  fs.appendFileSync(path.join(dir, '.claude/skills/diagnosing-bugs/SKILL.md'), '\n## Repo conventions\nPour un bug LLM, utiliser le skill `langfuse-trace`.\n');
  const preview = retire(dir, '.claude/skills/langfuse-trace', '.claude/skills/langfuse-trace');
  assert.deepEqual(preview.mentionedBy, ['diagnosing-bugs']);

});

test('tableau de bord : champs exigeant les deux-points, options une par ligne', t => {
  const dir = repo(t, { '.scratch/f/issues/01-a.md': '# Strict\n\n**Status:** ready-for-agent\n\nTypeScript strict obligatoire.\nStatus quo refusé.\n' });
  const [f] = board(dir);
  assert.equal(f.tickets[0].type, null);
  assert.equal(f.tickets[0].status, 'ready-for-agent');
  assert.match(html(board(dir), dir), /TypeScript strict obligatoire\. Status quo refusé\./);
  const opts = markdown('1. **Décision** : options : (a) lever une exception ; (b) renvoyer `None` ; (c) renvoyer inf');
  assert.match(opts, /options :<ul class="opts"><li><b>A\.<\/b> lever une exception<\/li><li><b>B\.<\/b> renvoyer <code>None<\/code><\/li><li><b>C\.<\/b> renvoyer inf<\/li><\/ul>/);
  assert.doesNotMatch(markdown('appel f(a) simple'), /opts/);
});

test('réponse depuis le tableau de bord : écrite sous Comments, ticket repassé prêt, chemins hors .scratch refusés', t => {
  const dir = repo(t, {
    '.scratch/f/issues/02-divide.md': '# Divide\r\n\r\n**Status:** needs-info\r\n\r\n## Comments\r\n\r\n- question : (a) exception ; (b) None\r\n',
    '.scratch/f/issues/03-ok.md': '# Ok\n\n**Status:** ready-for-agent\n',
    'README.md': '# x\n',
  });
  const result = answer(dir, '.scratch/f/issues/02-divide.md', 'Option A.\nDivision vraie.');
  assert.equal(result.status, 'ready-for-agent');
  const text = fs.readFileSync(path.join(dir, '.scratch/f/issues/02-divide.md'), 'utf8');
  assert.match(text, /\*\*Status:\*\* ready-for-agent/);
  assert.match(text, /réponse humaine \(depuis le tableau de bord\) :\r\n  > Option A\.\r\n  > Division vraie\./);
  assert.equal(board(dir)[0].tickets[0].state, 'ready');
  assert.throws(() => answer(dir, 'README.md', 'x'), /introuvable/);
  assert.throws(() => answer(dir, '.scratch/../README.md', 'x'), /introuvable/);
  assert.throws(() => answer(dir, '.scratch/f/issues/03-ok.md', 'x'), /n'attend pas/);
  assert.throws(() => answer(dir, '.scratch/f/issues/02-divide.md', '  '), /vide/);
  assert.doesNotMatch(html(board(dir), dir), /class="answer"/, 'pas de formulaire hors mode --serve');
});

test('hook de formatage : --ext évite de lancer un processus pour les autres fichiers', t => {
  const dir = repo(t);
  const marker = path.join(dir, 'formatted.txt');
  const formatter = path.join(dir, 'fmt.mjs');
  fs.writeFileSync(formatter, 'import fs from "node:fs"; fs.appendFileSync(' + JSON.stringify(marker) + ', process.argv.at(-1) + "|");');
  const edit = file => spawnSync(process.execPath, [path.join(ROOT, 'templates/hooks/on-edit.mjs'), '--ext=.py,.pyi', 'node', formatter], { input: JSON.stringify({ tool_input: { file_path: path.join(dir, file) } }), encoding: 'utf8' });
  edit('notes.md'); edit('src/app.PY');
  assert.equal(fs.readFileSync(marker, 'utf8'), path.join(dir, 'src/app.PY') + '|');
});

test('référence compacte des skills : chaque skill du snapshot y figure', () => {
  const text = fs.readFileSync(path.join(ROOT, 'skills/setup/references/skills.md'), 'utf8');
  for (const s of catalog()) assert.match(text, new RegExp('^\| ' + s.name + ' \|', 'm'), s.name);
});

test('scripts copiés : suivis par le lock, mis à jour s\'ils sont intacts, jamais écrasés sinon', t => {
  const dir = repo(t);
  install(dir, 'tdd', true);
  installTemplates(dir, 'board,use-cli,on-edit', true);
  const lockFile = path.join(dir, '.claude/matt-skills.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  // Simule une ancienne version installée : le board intact, use-cli modifié dans le repo.
  for (const to of ['.claude/matt/board.mjs', '.claude/hooks/use-cli.mjs']) { fs.writeFileSync(path.join(dir, to), '// ancienne version\n'); lock.templates[to].hash = crypto.createHash('sha256').update('// ancienne version\n').digest('hex'); }
  fs.writeFileSync(lockFile, JSON.stringify(lock));
  fs.appendFileSync(path.join(dir, '.claude/hooks/use-cli.mjs'), '// réglage local\n');
  const st = status(dir);
  assert.deepEqual(st.upgrade.scripts, ['.claude/matt/board.mjs']);
  assert.deepEqual(st.upgrade.scriptsToReview, ['.claude/hooks/use-cli.mjs']);
  upgrade(dir, true);
  assert.equal(fs.readFileSync(path.join(dir, '.claude/matt/board.mjs'), 'utf8'), fs.readFileSync(path.join(ROOT, TEMPLATES.board[0]), 'utf8'));
  assert.match(fs.readFileSync(path.join(dir, '.claude/hooks/use-cli.mjs'), 'utf8'), /réglage local/);
  assert.deepEqual(status(dir).upgrade.scripts, []);
  fs.writeFileSync(path.join(dir, 'x'), '');
  const other = repo(t, { '.claude/hooks/on-edit.mjs': '// hook maison\n' });
  assert.equal(installTemplates(other, 'on-edit', true).templates[0].state, 'different');
  assert.equal(fs.readFileSync(path.join(other, '.claude/hooks/on-edit.mjs'), 'utf8'), '// hook maison\n');
});

test('gabarit réel de to-tickets : titre « 01: … », None, dépendance avec titre', t => {
  const dir = repo(t, {
    '.scratch/f/issues/01-api.md': '# 01: Endpoint export CSV\n\n**What to build:** un endpoint.\n\n**Blocked by:** None (can start immediately)\n\n**Status:** ready-for-agent\n\n- [ ] critère\n',
    '.scratch/f/issues/02-ui.md': '# 02: Bouton export\n\n**What to build:** un bouton.\n\n**Blocked by:** 01 (Endpoint export CSV)\n\n**Status:** needs-info\n\n- [ ] critère\n',
  });
  const [a, b] = board(dir)[0].tickets;
  assert.deepEqual([a.title, a.blockedBy, a.state], ['Endpoint export CSV', [], 'ready']);
  assert.deepEqual([b.title, b.blockedBy, b.waitingOn, b.state], ['Bouton export', ['01'], ['01'], 'human']);
  answer(dir, '.scratch/f/issues/02-ui.md', 'Libellé : Exporter');
  assert.equal(board(dir)[0].tickets[1].status, 'ready-for-agent');
});

test('inventaire : signale un .scratch ou un .claude ignorés par Git (mémoire non partagée)', t => {
  const shared = repo(t, { 'README.md': 'x' });
  assert.deepEqual([inventory(shared, tmp(t)).mattConfig.scratchIgnored, inventory(shared, tmp(t)).mattConfig.claudeIgnored], [false, false]);
  const hidden = repo(t, { '.gitignore': '.scratch/\n.claude/\n' });
  assert.deepEqual([inventory(hidden, tmp(t)).mattConfig.scratchIgnored, inventory(hidden, tmp(t)).mattConfig.claudeIgnored], [true, true]);
});

test('panel : agents installés, skills branchés, toujours « intacts » et rebranchés après mise à jour', t => {
  const dir = repo(t, { '.claude/agents/security-reviewer.md': '---\nname: security-reviewer\ndescription: maison\n---\n' });
  install(dir, 'socle,wayfinder,implement-spec', true);
  const plan = installPanel(dir);
  assert.equal(plan.applied, false);
  assert.deepEqual(plan.skills.map(s => s.skill).sort(), ['code-review', 'diagnosing-bugs', 'implement-spec', 'to-spec', 'wayfinder']);
  installPanel(dir, true);
  for (const a of ['plan-challenger', 'ui-reviewer', 'approver', 'internal-researcher']) assert.ok(fs.existsSync(path.join(dir, '.claude/agents', a + '.md')), a);
  assert.match(fs.readFileSync(path.join(dir, '.claude/agents/security-reviewer.md'), 'utf8'), /maison/, 'agent du repo jamais écrasé');
  assert.match(fs.readFileSync(path.join(dir, '.claude/rules/matt-decisions.md'), 'utf8'), /Two of three agree/);
  const review = fs.readFileSync(path.join(dir, '.claude/skills/code-review/SKILL.md'), 'utf8');
  assert.match(review, /<!-- matt-setup:panel:start -->[\s\S]*security-reviewer[\s\S]*<!-- matt-setup:panel:end -->\r?\n$/);
  installPanel(dir, true);
  assert.equal(fs.readFileSync(path.join(dir, '.claude/skills/code-review/SKILL.md'), 'utf8'), review, 'idempotent');
  let st = status(dir);
  assert.ok(st.skills.every(s => s.state === 'pristine'), 'le bloc du panel n\'est pas une adaptation');
  // Nouvelle version amont simulée : le skill intact est remplacé puis rebranché.
  const lockFile = path.join(dir, '.claude/matt-skills.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  const old = 'ancienne version\n';
  fs.writeFileSync(path.join(dir, '.claude/skills/code-review/SKILL.md'), old + '\n<!-- matt-setup:panel:start -->\nx\n<!-- matt-setup:panel:end -->\n');
  lock.skills['code-review'].files['SKILL.md'] = crypto.createHash('sha256').update(old).digest('hex');
  fs.writeFileSync(lockFile, JSON.stringify(lock));
  st = status(dir);
  assert.deepEqual(st.upgrade.replace, ['code-review']);
  upgrade(dir, true);
  const after = fs.readFileSync(path.join(dir, '.claude/skills/code-review/SKILL.md'), 'utf8');
  assert.match(after, /Standards[\s\S]*<!-- matt-setup:panel:start -->[\s\S]*ui-reviewer/);
  assert.equal((after.match(/panel:start/g) || []).length, 1);
});

test('agents du panel : frontmatter valide, lecture seule, ligne de verdict', () => {
  for (const name of ['plan-challenger', 'security-reviewer', 'ui-reviewer', 'approver', 'internal-researcher']) {
    const text = fs.readFileSync(path.join(ROOT, 'templates/agents', name + '.md'), 'utf8');
    assert.match(text, new RegExp('^---\nname: ' + name + '\ndescription: .+\ndisallowedTools: Edit, Write, NotebookEdit\nmodel: (opus|sonnet)\neffort: (medium|high)\n---'), name);
    assert.match(text, /^(VERDICT|DECISION|ANSWER): /m, name);
  }
  for (const [skill, agents] of Object.entries(PANEL)) {
    const block = fs.readFileSync(path.join(ROOT, 'templates/panel', skill + '.md'), 'utf8');
    for (const a of agents) assert.match(block, new RegExp('`' + a + '`'), skill + ' → ' + a);
  }
});
