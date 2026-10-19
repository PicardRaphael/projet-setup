#!/usr/bin/env node
// Hook PreToolUse (Edit|Write|NotebookEdit) : les agents listés en arguments n'écrivent que dans leur propre mémoire,
// .claude/agent-memory/<agent>/. Toute autre écriture de leur part est refusée ; les autres agents et la session ne sont pas concernés.
// Exemple : node .claude/hooks/memory-guard.mjs plan-challenger security-reviewer ui-reviewer approver internal-researcher
import path from 'node:path';

let input = '';
process.stdin.on('data', chunk => (input += chunk)).on('end', () => {
  const event = JSON.parse(input || '{}');
  const agent = event.agent_type;
  if (!agent || !process.argv.slice(2).includes(agent)) return;
  const file = event.tool_input?.file_path || event.tool_input?.notebook_path;
  if (!file) return;
  const root = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const norm = p => { const r = path.resolve(root, p); return process.platform === 'win32' ? r.toLowerCase() : r; };
  const allowed = norm(path.join('.claude', 'agent-memory', agent)) + path.sep;
  if (norm(file).startsWith(allowed)) return;
  process.stderr.write(agent + ' ne peut écrire que dans sa mémoire (.claude/agent-memory/' + agent + '/). Rapporte le changement voulu dans ta réponse : l\'orchestrateur décidera.\n');
  process.exit(2);
});
