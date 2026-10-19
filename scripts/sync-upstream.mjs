#!/usr/bin/env node
// Met à jour vendor/ depuis un clone de https://github.com/mattpocock/skills.
//   node scripts/sync-upstream.mjs --from ../mattpocock-skills            montre les changements
//   node scripts/sync-upstream.mjs --from ../mattpocock-skills --apply    remplace vendor/ et monte la version du plugin
// Seuls les skills publiés (listés dans .claude-plugin/plugin.json de Matt) sont repris.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROFILES } from './matt-setup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
// Empreinte indépendante des fins de ligne, comme dans matt-setup.mjs.
const sha = file => { const bytes = fs.readFileSync(file); return crypto.createHash('sha256').update(bytes.includes(0) ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex'); };

function treeHash(dir) {
  const parts = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name !== 'LICENSE.mattpocock') parts.push(path.relative(dir, file).split(path.sep).join('/') + ':' + sha(file));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return parts.join('\n');
}

export function sync(from, apply = false) {
  const clone = path.resolve(from);
  const manifest = readJson(path.join(clone, '.claude-plugin/plugin.json'));
  const commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const current = readJson(path.join(VENDOR, 'provenance.json'));
  const skills = manifest.skills.map(p => { const rel = p.replace(/^\.\//, ''); return { name: path.basename(rel), path: rel }; });
  const before = new Map(current.skills.map(s => [s.name, s]));
  const report = {
    from: { commit: current.commit, version: current.declaredVersion },
    to: { commit, version: manifest.version },
    added: skills.filter(s => !before.has(s.name)).map(s => s.name),
    removed: current.skills.filter(s => !skills.some(n => n.name === s.name)).map(s => s.name),
    changed: skills.filter(s => before.has(s.name) && treeHash(path.join(VENDOR, before.get(s.name).path)) !== treeHash(path.join(clone, s.path))).map(s => s.name),
  };
  const profiled = new Set(Object.values(PROFILES).flat());
  report.toClassify = report.added.filter(n => !profiled.has(n));
  report.note = report.toClassify.length || report.removed.length
    ? 'Ranger les nouveaux skills dans PROFILES et retirer les skills disparus de PROFILES et DEPENDENCIES (scripts/matt-setup.mjs) ainsi que de skills/setup/references/skills.md, vérifier les appels « Skill tool with … », puis relancer les tests.'
    : undefined;
  if (apply && (report.added.length || report.removed.length || report.changed.length)) {
    const next = path.join(ROOT, 'vendor.next');
    fs.rmSync(next, { recursive: true, force: true });
    for (const s of skills) {
      fs.cpSync(path.join(clone, s.path), path.join(next, s.path), { recursive: true });
      fs.copyFileSync(path.join(clone, 'LICENSE'), path.join(next, s.path, 'LICENSE.mattpocock'));
    }
    fs.copyFileSync(path.join(clone, 'LICENSE'), path.join(next, 'LICENSE'));
    fs.writeFileSync(path.join(next, 'provenance.json'), JSON.stringify({
      repository: 'https://github.com/mattpocock/skills', commit, declaredVersion: manifest.version,
      snapshotDate: new Date().toISOString().slice(0, 10),
      distribution: 'Skills published in plugin.json at the pinned commit',
      skills: skills.map(s => ({ ...s, skillSha256: sha(path.join(clone, s.path, 'SKILL.md')) })),
    }, null, 2) + '\n');
    // Remplacement en fin de copie : un échec plus haut laisse vendor/ intact.
    fs.rmSync(VENDOR, { recursive: true });
    fs.renameSync(next, VENDOR);
    const pluginFile = path.join(ROOT, '.claude-plugin/plugin.json');
    const plugin = readJson(pluginFile);
    const [major, minor, patch] = plugin.version.split('.').map(Number);
    plugin.version = [major, minor, patch + 1].join('.');
    fs.writeFileSync(pluginFile, JSON.stringify(plugin, null, 2) + '\n');
    report.pluginVersion = plugin.version;
  }
  return { applied: apply, ...report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const from = args[args.indexOf('--from') + 1];
  try {
    if (!args.includes('--from') || !from) throw new Error('Usage : node scripts/sync-upstream.mjs --from <clone de mattpocock/skills> [--apply]');
    console.log(JSON.stringify(sync(from, args.includes('--apply')), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
