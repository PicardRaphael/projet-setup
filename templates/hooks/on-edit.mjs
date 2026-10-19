#!/usr/bin/env node
// Hook PostToolUse (Edit|Write) : lance la commande donnée en arguments sur le fichier édité.
// Exemple : node .claude/hooks/on-edit.mjs --ext=.ts,.tsx,.js,.json,.md npx prettier --write
// --ext (facultatif) limite aux extensions utiles : aucun processus lancé pour les autres fichiers.
// N'interrompt jamais Claude : une erreur du formateur est seulement signalée.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let input = '';
process.stdin.on('data', chunk => (input += chunk)).on('end', () => {
  const file = JSON.parse(input || '{}').tool_input?.file_path;
  let command = process.argv.slice(2);
  const ext = command[0]?.startsWith('--ext=') ? command.shift().slice(6).split(',').map(e => e.trim().toLowerCase()) : null;
  if (!file || !command.length || (ext && !ext.includes(path.extname(file).toLowerCase()))) return;
  const quote = s => /^[\w./:\\-]+$/.test(s) ? s
    : process.platform === 'win32' ? '"' + s.replace(/"/g, '""') + '"'
    : "'" + s.replace(/'/g, "'\\''") + "'";
  // shell:true pour trouver npx/npm (.cmd) sous Windows ; les arguments sont cités.
  const result = spawnSync([...command, file].map(quote).join(' '), { shell: true, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) process.stderr.write('on-edit : ' + command[0] + ' a échoué sur ' + file + '\n' + (result.stderr || ''));
});
