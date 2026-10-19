#!/usr/bin/env node
// Opérations déterministes du setup : inventaire, installation versionnée des skills de Matt,
// état des copies (intactes / adaptées / mise à jour disponible), mise à jour, archivage.
// Les décisions sémantiques (quoi adapter, quoi retirer) restent au skill setup et à l'utilisateur.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor');
const LOCK = '.claude/matt-skills.lock.json';
const SKILLS_DIR = '.claude/skills';
const BOARD = '.claude/matt/board.mjs';

// Appels entre skills relevés dans le texte de Matt (« Call the Skill tool with … »).
export const DEPENDENCIES = {
  'tdd': ['codebase-design'],
  'implement': ['tdd', 'code-review'],
  'implement-spec': ['tdd', 'code-review'],
  'improve-codebase-architecture': ['codebase-design', 'grilling', 'domain-modeling'],
  'retro': ['writing-for-agents'],
  'wayfinder': ['research', 'prototype', 'grilling', 'domain-modeling'],
  'grill-me': ['grilling'],
  'grill-with-docs': ['grilling', 'domain-modeling'],
  'triage': ['grilling', 'domain-modeling'],
};

// socle : flux complet idée → spec → tickets → code → revue, plus bugs et retours d'expérience.
// optionnels : proposés selon le repo. Les autres restent disponibles avec --skills.
export const PROFILES = {
  socle: ['ask-matt', 'setup-matt-pocock-skills', 'grill-with-docs', 'grilling', 'domain-modeling', 'to-spec', 'to-tickets', 'implement', 'tdd', 'code-review', 'codebase-design', 'pr', 'diagnosing-bugs', 'retro', 'writing-for-agents'],
  optionnels: ['implement-spec', 'triage', 'wayfinder', 'research', 'prototype', 'handoff', 'improve-codebase-architecture', 'wizard'],
  rares: ['grill-me', 'to-questionnaire', 'wait-what', 'teach'],
};

function withDependencies(names) {
  const out = new Set();
  const add = name => { if (out.has(name)) return; out.add(name); for (const dep of DEPENDENCIES[name] || []) add(dep); };
  names.forEach(add);
  return [...out];
}

const sorted = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Empreinte indépendante des fins de ligne : Git les convertit selon la machine (core.autocrlf).
const contentHash = file => { const bytes = fs.readFileSync(file); return sha(bytes.includes(0) ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n')); };
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
const posix = p => p.split(path.sep).join('/');

function git(repo, args) {
  try { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

function gitOk(repo, args) {
  try { execFileSync('git', ['-C', repo, ...args], { windowsHide: true, stdio: 'ignore' }); return true; } catch { return false; }
}

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const head = text.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
  const value = key => head.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'))?.[1].trim().replace(/^["']|["']$/g, '') || null;
  return { name: value('name'), description: value('description'), disableModelInvocation: value('disable-model-invocation') === 'true', lines: text.split('\n').length };
}

// Hash de chaque fichier d'un dossier, chemins relatifs en notation POSIX.
const PANEL_START = '<!-- matt-setup:panel:start -->';
const PANEL_END = '<!-- matt-setup:panel:end -->';
const stripPanel = text => text.replace(/\n*<!-- matt-setup:panel:start -->[\s\S]*?<!-- matt-setup:panel:end -->\n?/g, '\n').replace(/\n+$/, '\n');

function hashTree(dir) {
  const files = {};
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(file);
      // Le bloc du panel ajouté par install-panel ne compte pas comme une adaptation : le skill reste à jour automatiquement.
      else if (entry.name === 'SKILL.md') files[posix(path.relative(dir, file))] = sha(stripPanel(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')));
      else files[posix(path.relative(dir, file))] = contentHash(file);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return sorted(files);
}

export function catalog() {
  const provenance = readJson(path.join(VENDOR, 'provenance.json'));
  return provenance.skills.map(s => ({ ...s, dir: path.join(VENDOR, s.path), ...frontmatter(path.join(VENDOR, s.path, 'SKILL.md')) }));
}

function source() {
  const p = readJson(path.join(VENDOR, 'provenance.json'));
  return { repository: p.repository, commit: p.commit, version: p.declaredVersion };
}

function repoRoot(input) {
  const dir = fs.realpathSync(input || process.cwd());
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  return top ? fs.realpathSync(top) : dir;
}

function readLock(repo) {
  const file = path.join(repo, LOCK);
  return fs.existsSync(file) ? readJson(file) : null;
}

function listSkills(base, scope) {
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(base, e.name, 'SKILL.md')))
    .map(e => ({ dir: e.name, scope, path: path.join(base, e.name), ...frontmatter(path.join(base, e.name, 'SKILL.md')) }));
}

function listMarkdown(base) {
  const out = [];
  const walk = dir => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.md')) out.push(f); } };
  walk(base);
  return out;
}

function hooksSummary(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const settings = readJson(file);
    return {
      hooks: Object.fromEntries(Object.entries(settings.hooks || {}).map(([event, groups]) => [event, groups.map(g => ({ matcher: g.matcher || '*', commands: (g.hooks || []).map(h => h.command || h.type) }))])),
      permissions: { allow: settings.permissions?.allow?.length || 0, deny: settings.permissions?.deny || [], ask: settings.permissions?.ask?.length || 0 },
      plugins: Object.keys(settings.enabledPlugins || {}),
    };
  } catch (error) { return { error: 'JSON invalide : ' + error.message }; }
}

function stack(repo) {
  const exists = f => fs.existsSync(path.join(repo, f));
  const result = { languages: [], packageManager: null, scripts: {}, formatters: [], linters: [] };
  if (exists('package.json')) {
    result.languages.push(exists('tsconfig.json') ? 'typescript' : 'javascript');
    try { result.scripts = readJson(path.join(repo, 'package.json')).scripts || {}; } catch { /* package.json illisible : signalé par l'absence de scripts */ }
    result.packageManager = exists('pnpm-lock.yaml') ? 'pnpm' : exists('yarn.lock') ? 'yarn' : exists('bun.lockb') || exists('bun.lock') ? 'bun' : 'npm';
  }
  if (exists('pyproject.toml') || exists('requirements.txt') || exists('uv.lock') || exists('setup.py')) {
    result.languages.push('python');
    const pyproject = exists('pyproject.toml') ? fs.readFileSync(path.join(repo, 'pyproject.toml'), 'utf8') : '';
    // Le gestionnaire décide des commandes proposées : `uv run pytest` plutôt que `pytest` ou `pip install`.
    result.python = {
      manager: exists('uv.lock') || /\[tool\.uv\]/.test(pyproject) ? 'uv' : exists('poetry.lock') || /\[tool\.poetry\]/.test(pyproject) ? 'poetry' : exists('Pipfile') ? 'pipenv' : exists('pdm.lock') ? 'pdm' : 'pip',
      tools: ['pytest', 'ruff', 'mypy', 'pyright', 'black'].filter(tool => new RegExp('\\[tool\\.' + tool + '|\\b' + tool + '\\b').test(pyproject) || exists(tool + '.toml') || (tool === 'pytest' && (exists('pytest.ini') || exists('conftest.py')))),
    };
  }
  if (exists('go.mod')) result.languages.push('go');
  if (exists('Cargo.toml')) result.languages.push('rust');
  if (exists('composer.json')) result.languages.push('php');
  for (const [file, tool] of [['.prettierrc', 'prettier'], ['.prettierrc.json', 'prettier'], ['prettier.config.js', 'prettier'], ['biome.json', 'biome'], ['ruff.toml', 'ruff'], ['.editorconfig', 'editorconfig']]) if (exists(file) && !result.formatters.includes(tool)) result.formatters.push(tool);
  if (exists('pyproject.toml') && /\[tool\.ruff/.test(fs.readFileSync(path.join(repo, 'pyproject.toml'), 'utf8')) && !result.formatters.includes('ruff')) result.formatters.push('ruff');
  for (const file of ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs']) if (exists(file)) { result.linters.push('eslint'); break; }
  // SDK d'IA : décident des skills et serveurs MCP à signaler (claude-api, Langfuse…).
  const manifests = ['package.json', 'pyproject.toml', 'requirements.txt'].filter(exists).map(f => fs.readFileSync(path.join(repo, f), 'utf8')).join('\n');
  result.ai = [['anthropic', /@anthropic-ai\/sdk|["'\s]anthropic[\s"'>=<~^\[]/], ['claude-agent-sdk', /claude-agent-sdk/], ['openai', /["'\s]openai[\s"'>=<~^\[]/], ['vercel-ai', /"ai"\s*:/], ['langchain', /langchain/], ['langfuse', /langfuse/], ['llamaindex', /llama[-_]?index/]]
    .filter(([, pattern]) => pattern.test(manifests)).map(([name]) => name);
  return result;
}

export function inventory(input, home = os.homedir()) {
  const repo = repoRoot(input);
  const lock = readLock(repo);
  const managed = new Set(Object.keys(lock?.skills || {}));
  const names = new Set(catalog().map(s => s.name));
  const tracked = new Set((git(repo, ['ls-files', '.claude', '.agents']) || '').split('\n').filter(Boolean).map(f => f.split('/').slice(0, 3).join('/')));
  const projectSkills = [...listSkills(path.join(repo, SKILLS_DIR), 'project'), ...listSkills(path.join(repo, '.agents/skills'), 'agents')]
    .map(({ description, lines, ...s }) => ({ ...s, path: posix(path.relative(repo, s.path)), managedByMatt: s.scope === 'project' && managed.has(s.dir), sameNameAsMatt: names.has(s.name || s.dir), tracked: tracked.has(posix(path.relative(repo, s.path))) }));
  const personal = listSkills(path.join(home, '.claude/skills'), 'personal').map(s => s.name || s.dir);
  const instructions = ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'].filter(f => fs.existsSync(path.join(repo, f))).map(f => {
    const text = fs.readFileSync(path.join(repo, f), 'utf8');
    return { file: f, hasAgentSkillsSection: /^## Agent skills/m.test(text) };
  });
  const files = (git(repo, ['ls-files']) || '').split('\n').filter(Boolean);
  const exists = f => fs.existsSync(path.join(repo, f));
  return {
    repo,
    git: { isRepo: !!git(repo, ['rev-parse', '--git-dir']), remotes: (git(repo, ['remote', '-v']) || '').split('\n').filter(l => l.endsWith('(fetch)')).map(l => l.split(/\s+/).slice(0, 2).join(' ')) },
    empty: files.length === 0 && fs.readdirSync(repo).filter(f => f !== '.git').length === 0,
    instructions,
    skills: projectSkills,
    personalSkillsShadowingMatt: personal.filter(n => names.has(n)),
    globalMattKit: fs.existsSync(path.join(home, '.claude/skills/matt/.claude-plugin/plugin.json')),
    agents: listMarkdown(path.join(repo, '.claude/agents')).map(f => ({ path: posix(path.relative(repo, f)), name: frontmatter(f).name })),
    commands: listMarkdown(path.join(repo, '.claude/commands')).map(f => posix(path.relative(repo, f))),
    rules: listMarkdown(path.join(repo, '.claude/rules')).map(f => posix(path.relative(repo, f))),
    settings: { project: hooksSummary(path.join(repo, '.claude/settings.json')), local: hooksSummary(path.join(repo, '.claude/settings.local.json')) },
    mcpServers: exists('.mcp.json') ? Object.keys(readJson(path.join(repo, '.mcp.json')).mcpServers || {}) : [],
    mattConfig: {
      docsAgents: fs.existsSync(path.join(repo, 'docs/agents')) ? fs.readdirSync(path.join(repo, 'docs/agents')) : [],
      scratch: exists('.scratch'),
      worktreeinclude: exists('.worktreeinclude'),
      board: exists(BOARD),
      worktreesIgnored: gitOk(repo, ['check-ignore', '-q', '.claude/worktrees/x']),
      // Mémoire d'équipe : un .scratch ignoré par Git garde tickets et réponses sur une seule machine.
      scratchIgnored: gitOk(repo, ['check-ignore', '-q', '.scratch/x/issues/01-x.md']),
      claudeIgnored: gitOk(repo, ['check-ignore', '-q', '.claude/skills/x/SKILL.md']),
    },
    stack: stack(repo),
    matt: lock ? { source: lock.source, installed: [...managed] } : null,
  };
}

// Copie des skills de Matt dans .claude/skills, sans jamais écraser un dossier existant.
export function install(input, wanted = 'socle', apply = false) {
  const repo = repoRoot(input);
  const all = catalog();
  const requested = wanted === 'all' ? all.map(s => s.name) : wanted.split(',').flatMap(n => PROFILES[n.trim()] || [n.trim()]);
  const names = withDependencies(requested);
  const selected = names.map(n => all.find(s => s.name === n) || (() => { throw new Error('Skill Matt inconnu : ' + n); })());
  const lock = readLock(repo) || { source: source(), skills: {} };
  const plan = { repo, add: [], addedAsDependency: names.filter(n => !requested.includes(n) && !lock.skills[n]), alreadyInstalled: [], conflicts: [] };
  for (const s of selected) {
    const target = path.join(repo, SKILLS_DIR, s.name);
    if (lock.skills[s.name]) plan.alreadyInstalled.push(s.name);
    else if (fs.existsSync(target)) plan.conflicts.push({ skill: s.name, path: posix(path.relative(repo, target)), reason: 'Un skill du repo occupe déjà ce nom : à comparer, fusionner ou renommer avant installation.' });
    else plan.add.push(s.name);
  }
  if (apply && plan.add.length) {
    for (const name of plan.add) {
      const s = all.find(x => x.name === name);
      const target = path.join(repo, SKILLS_DIR, name);
      fs.cpSync(s.dir, target, { recursive: true, errorOnExist: true, force: false });
      lock.skills[name] = { files: hashTree(s.dir) };
    }
    lock.source = lock.source || source();
    writeJson(path.join(repo, LOCK), lock);
  }
  return { applied: apply, ...plan };
}

// État de chaque skill installé par rapport au lock (installé) et au snapshot (disponible).
export function status(input) {
  const repo = repoRoot(input);
  const lock = readLock(repo);
  if (!lock) return { repo, installed: false, skills: [] };
  const all = catalog();
  const skills = Object.entries(lock.skills).map(([name, entry]) => {
    const dir = path.join(repo, SKILLS_DIR, name);
    if (!fs.existsSync(dir)) return { name, state: 'missing' };
    const current = hashTree(dir);
    const changed = [...new Set([...Object.keys(current), ...Object.keys(entry.files)])].filter(f => current[f] !== entry.files[f]);
    const upstream = all.find(s => s.name === name);
    const upstreamFiles = upstream ? hashTree(upstream.dir) : {};
    const update = upstream && JSON.stringify(upstreamFiles) !== JSON.stringify(sorted(entry.files));
    return { name, state: changed.length ? 'adapted' : 'pristine', changed, updateAvailable: !!update, removedUpstream: !upstream };
  });
  const latest = source();
  const present = new Set(skills.filter(s => s.state !== 'missing').map(s => s.name));
  const brokenCalls = [...present].flatMap(name => (DEPENDENCIES[name] || []).filter(dep => !present.has(dep)).map(dep => name + ' → ' + dep));
  const templates = templateStatus(repo, lock);
  return {
    repo, installed: true, source: lock.source, snapshot: latest, skills, templates, brokenCalls,
    upgrade: {
      replace: skills.filter(s => s.state === 'pristine' && s.updateAvailable).map(s => s.name),
      merge: skills.filter(s => s.state === 'adapted' && s.updateAvailable).map(s => s.name),
      scripts: templates.filter(x => x.state === 'pristine' && x.updateAvailable).map(x => x.path),
      scriptsToReview: templates.filter(x => x.state === 'adapted' && x.updateAvailable).map(x => x.path),
    },
    notInstalled: all.map(s => s.name).filter(n => !lock.skills[n]),
  };
}

// Met à jour les skills intacts ; les skills adaptés sont listés pour une fusion assistée.
export function upgrade(input, apply = false) {
  const repo = repoRoot(input);
  const st = status(repo);
  if (!st.installed) throw new Error('Aucun skill Matt installé dans ce repo');
  const replace = st.skills.filter(s => s.state === 'pristine' && s.updateAvailable).map(s => s.name);
  const scripts = st.templates.filter(x => x.state === 'pristine' && x.updateAvailable).map(x => x.path);
  if (apply && scripts.length) {
    const lock = readLock(repo);
    for (const to of scripts) {
      const from = path.join(ROOT, lock.templates[to].from);
      fs.copyFileSync(from, path.join(repo, to));
      lock.templates[to].hash = contentHash(from);
    }
    writeJson(path.join(repo, LOCK), lock);
  }
  const merge = st.skills.filter(s => s.state === 'adapted' && s.updateAvailable).map(s => ({ name: s.name, upstream: posix(path.join(VENDOR, catalog().find(c => c.name === s.name).path)), local: posix(path.join(SKILLS_DIR, s.name)), changed: s.changed }));
  if (apply && replace.length) {
    const lock = readLock(repo);
    for (const name of replace) {
      const s = catalog().find(c => c.name === name);
      const target = path.join(repo, SKILLS_DIR, name);
      fs.rmSync(target, { recursive: true });
      fs.cpSync(s.dir, target, { recursive: true });
      if (lock.panel?.includes(name)) appendPanel(path.join(target, 'SKILL.md'), name);
      lock.skills[name] = { files: hashTree(s.dir) };
    }
    lock.source = source();
    writeJson(path.join(repo, LOCK), lock);
  }
  return { applied: apply, replace, scripts, merge, note: merge.length ? 'Fusionner à la main la nouvelle version amont dans chaque copie adaptée, puis lancer upgrade --accept <nom>.' : undefined };
}

// Après fusion d'une copie adaptée : le lock prend la version amont actuelle comme base.
export function acceptAdaptation(input, name) {
  const repo = repoRoot(input);
  const lock = readLock(repo);
  const s = catalog().find(c => c.name === name);
  if (!lock?.skills[name] || !s) throw new Error('Skill Matt non installé : ' + name);
  lock.skills[name] = { files: hashTree(s.dir) };
  lock.source = source();
  writeJson(path.join(repo, LOCK), lock);
  return { name, base: lock.source.commit };
}

// Archive un skill du repo dans .claude/skills-archive (non chargé, versionnable, réversible).
export function retire(input, relative, confirm, apply = false) {
  const repo = repoRoot(input);
  if (confirm !== relative) throw new Error('Confirmer avec --confirm le chemin exact accepté par l\'utilisateur');
  if (!/^(\.claude\/(skills|agents|commands|rules)|\.agents\/skills)\/[^/]+$/.test(relative)) throw new Error('Archivage limité à un skill, agent, commande ou règle du repo');
  const from = path.join(repo, relative);
  if (!fs.existsSync(from)) throw new Error('Introuvable : ' + relative);
  const to = path.join(repo, '.claude/skills-archive', relative.replace(/^\./, '').replaceAll('/', '__'));
  if (fs.existsSync(to)) throw new Error('Archive déjà présente : ' + posix(path.relative(repo, to)));
  const tracked = !!git(repo, ['ls-files', '--error-unmatch', relative]);
  const lockNow = readLock(repo);
  const retiring = path.basename(relative);
  const dependents = lockNow?.skills[retiring] ? Object.keys(lockNow.skills).filter(n => (DEPENDENCIES[n] || []).includes(retiring)) : [];
  if (dependents.length) throw new Error(retiring + ' est appelé par ' + dependents.join(', ') + ' : les archiver d\'abord ou garder ' + retiring);
  // Un skill du repo branché dans une autre (ex. langfuse-trace cité par diagnosing-bugs) laisserait un appel mort.
  const skillsDir = path.join(repo, SKILLS_DIR);
  const mentionedBy = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter(n => n !== retiring && fs.existsSync(path.join(skillsDir, n, 'SKILL.md')) &&
    new RegExp('(^|[^\\w-])' + retiring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\w-]|$)').test(fs.readFileSync(path.join(skillsDir, n, 'SKILL.md'), 'utf8'))) : [];
  if (apply) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (tracked) execFileSync('git', ['-C', repo, 'mv', relative, posix(path.relative(repo, to))], { windowsHide: true, stdio: 'ignore' });
    else fs.renameSync(from, to);
    const lock = readLock(repo);
    const name = path.basename(relative);
    if (lock?.skills[name] && relative === SKILLS_DIR + '/' + name) { delete lock.skills[name]; writeJson(path.join(repo, LOCK), lock); }
  }
  return {
    applied: apply, from: relative, to: posix(path.relative(repo, to)), tracked,
    ...(mentionedBy.length ? { mentionedBy, warning: 'Ces skills citent encore ' + retiring + ' : retirer ou remplacer la mention, sauf simple note d\'origine.' } : {}),
    restore: 'Déplacer le dossier archivé à son emplacement d\'origine.',
  };
}

// Copie le script de suivi dans le repo, pour qu'il fonctionne chez toute l'équipe.
// Scripts copiés dans le repo (tableau de bord, hooks). Suivis dans le lock pour recevoir les correctifs avec `upgrade`.
export const TEMPLATES = {
  board: ['templates/board.mjs', BOARD],
  'on-edit': ['templates/hooks/on-edit.mjs', '.claude/hooks/on-edit.mjs'],
  'use-cli': ['templates/hooks/use-cli.mjs', '.claude/hooks/use-cli.mjs'],
  ...Object.fromEntries(['plan-challenger', 'security-reviewer', 'ui-reviewer', 'approver', 'internal-researcher']
    .map(name => [name, ['templates/agents/' + name + '.md', '.claude/agents/' + name + '.md']])),
};

// Panel de spécialistes : quels agents chaque skill de Matt appelle, via un bloc ajouté à la fin de sa copie.
export const PANEL = {
  'to-spec': ['plan-challenger'],
  'wayfinder': ['plan-challenger', 'internal-researcher'],
  'code-review': ['security-reviewer', 'ui-reviewer'],
  'implement-spec': ['approver'],
  // diagnosing-bugs n'appelle pas code-review : le bloc l'y ajoute, ses relecteurs suivent.
  'diagnosing-bugs': ['security-reviewer', 'ui-reviewer'],
};

function appendPanel(file, skill) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(PANEL_START)) return false;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = fs.readFileSync(path.join(ROOT, 'templates/panel', skill + '.md'), 'utf8').replace(/\r\n/g, '\n').trim().split('\n').join(eol);
  fs.writeFileSync(file, text.replace(/\s*$/, () => eol + eol + PANEL_START + eol + block + eol + PANEL_END + eol));
  return true;
}

// Installe les agents du panel et branche les skills de Matt déjà installés. Un agent du repo de même nom n'est jamais écrasé.
export function installPanel(input, apply = false) {
  const repo = repoRoot(input);
  const lock = readLock(repo);
  if (!lock) throw new Error('Installer d\'abord les skills de Matt (install)');
  const skills = Object.keys(PANEL).filter(s => lock.skills[s]);
  const agents = [...new Set(skills.flatMap(s => PANEL[s]))];
  const plan = installTemplates(repo, agents.join(','), apply);
  const patched = skills.map(s => {
    const file = path.join(repo, SKILLS_DIR, s, 'SKILL.md');
    const already = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(PANEL_START);
    if (apply && !already) appendPanel(file, s);
    return { skill: s, state: already ? 'same' : 'add', agents: PANEL[s] };
  });
  if (apply) {
    const next = readLock(repo);
    next.panel = [...new Set([...(next.panel || []), ...skills])];
    writeJson(path.join(repo, LOCK), next);
  }
  return {
    applied: apply, agents: plan.templates, skills: patched,
    notInstalled: Object.keys(PANEL).filter(s => !lock.skills[s]),
    note: plan.templates.some(t => t.state === 'different') ? 'Un agent du repo porte déjà ce nom : il est gardé. Vérifier qu\'il rend la même ligne de verdict, ou adapter le bloc du skill.' : undefined,
  };
}

export function installTemplates(input, wanted = 'board', apply = false) {
  const repo = repoRoot(input);
  const lock = readLock(repo) || { source: source(), skills: {} };
  lock.templates = lock.templates || {};
  const result = wanted.split(',').map(n => n.trim()).map(name => {
    const pair = TEMPLATES[name];
    if (!pair) throw new Error('Script inconnu : ' + name + ' (connus : ' + Object.keys(TEMPLATES).join(', ') + ')');
    const [from, to] = pair;
    const target = path.join(repo, to);
    const hash = contentHash(path.join(ROOT, from));
    const state = !fs.existsSync(target) ? 'add' : contentHash(target) === hash ? 'same' : 'different';
    if (apply && state === 'add') { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(ROOT, from), target); }
    if (apply && state !== 'different') lock.templates[to] = { from, hash };
    return { name, path: to, state, ...(state === 'different' ? { note: 'Un fichier différent existe déjà : à comparer, rien n\'est écrasé.' } : {}) };
  });
  if (apply) writeJson(path.join(repo, LOCK), lock);
  return { applied: apply, templates: result };
}

function templateStatus(repo, lock) {
  return Object.entries(lock.templates || {}).map(([to, entry]) => {
    const target = path.join(repo, to);
    if (!fs.existsSync(target)) return { path: to, state: 'missing' };
    const source = path.join(ROOT, entry.from);
    return { path: to, state: contentHash(target) === entry.hash ? 'pristine' : 'adapted', updateAvailable: fs.existsSync(source) && contentHash(source) !== entry.hash };
  });
}

function parse(args) {
  const [command, ...rest] = args; const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue;
    const key = rest[i].slice(2);
    opts[key] = rest[i + 1] === undefined || rest[i + 1].startsWith('--') ? true : rest[++i];
  }
  return { command, opts };
}

export function main(args = process.argv.slice(2)) {
  const { command, opts } = parse(args);
  const repo = opts.repo === true ? undefined : opts.repo;
  const apply = opts.apply === true;
  const run = {
    inventory: () => inventory(repo),
    install: () => install(repo, typeof opts.skills === 'string' ? opts.skills : typeof opts.profile === 'string' ? opts.profile : 'socle', apply),
    status: () => status(repo),
    upgrade: () => typeof opts.accept === 'string' ? acceptAdaptation(repo, opts.accept) : upgrade(repo, apply),
    retire: () => retire(repo, opts.path, opts.confirm, apply),
    'install-templates': () => installTemplates(repo, typeof opts.files === 'string' ? opts.files : 'board', apply),
    'install-board': () => installTemplates(repo, 'board', apply),
    'install-panel': () => installPanel(repo, apply),
  }[command];
  if (!run) throw new Error('Commandes : inventory install status upgrade retire install-templates install-panel');
  process.stdout.write(JSON.stringify(run(), null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
