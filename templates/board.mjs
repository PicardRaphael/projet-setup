#!/usr/bin/env node
// Suivi des travaux du tracker local de Matt (.scratch/<feature>/spec.md, map.md, issues/NN-*.md).
// Copié dans le repo par matt-setup ; aucune dépendance. Seule écriture : la réponse à un ticket depuis le tableau de bord.
//   node .claude/matt/board.mjs            résumé texte
//   node .claude/matt/board.mjs --brief    résumé court (hook SessionStart), rien si aucun travail ouvert
//   node .claude/matt/board.mjs --json     données brutes
//   node .claude/matt/board.mjs --serve [port]   tableau de bord local, mis à jour quand un ticket change
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Le premier mot du statut décide de l'état : « needs-info (voir question) » attend bien un humain.
const DONE = /^(resolved|done|closed|wontfix|merged)\b/i;
const ACTIVE = /^(claimed|in-progress|in progress|doing)\b/i;
// Rôles de triage de Matt qui attendent une personne : needs-info (réponse attendue), ready-for-human (travail humain).
const HUMAN = /^(needs-info|ready-for-human|needs-human|awaiting-user|waiting|unreadable)\b/i;
const BLOCKED = /^blocked\b/i;
// « Status: x » ou « **Status:** x » ; les deux-points sont obligatoires (« TypeScript strict » n'est pas un champ Type)
// et la valeur reste sur la même ligne.
const FIELD = name => '\\**[ \\t]*' + name + '[ \\t]*(?::\\**|\\**[ \\t]*:)';

// Les champs se lisent dans l'en-tête du ticket, avant le premier « ## » : une phrase « Status: … » plus bas n'en est pas un.
function splitHead(text) {
  const at = text.search(/^##\s/m);
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at)];
}

function field(head, name) {
  const match = head.match(new RegExp('^' + FIELD(name) + '[ \\t]*(.+)$', 'im'));
  return match ? match[1].replace(/\*\*/g, '').trim().replace(/^`|`$/g, '') || null : null;
}

function title(text, fallback) {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

const normalize = n => String(Number(n));

function readTicket(file) {
  const name = path.basename(file, '.md');
  const number = name.match(/^\d+/)?.[0] || name;
  try {
    const text = fs.readFileSync(file, 'utf8');
    const [head] = splitHead(text);
    const blockedBy = (field(head, 'Blocked by') || '').split(/[,\s]+/).map(x => x.replace(/^#/, '').match(/^\d+/)?.[0]).filter(Boolean);
    return { number, file, text, title: title(text, name).replace(/^\d+\s*[:.\-–—]\s*/, ''), status: field(head, 'Status') || 'open', type: field(head, 'Type'), blockedBy };
  } catch (error) {
    // Un ticket illisible ne doit pas faire disparaître tout le suivi : il est signalé à une personne.
    return { number, file, text: '', title: name + ' (illisible : ' + error.code + ')', status: 'unreadable', type: null, blockedBy: [] };
  }
}

const isFile = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };
const readOr = (file, fallback) => { try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; } };

export function board(repo) {
  const root = path.join(repo, '.scratch');
  if (!fs.existsSync(root)) return [];
  const features = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const spec = path.join(dir, 'spec.md');
    const map = path.join(dir, 'map.md');
    const issuesDir = path.join(dir, 'issues');
    let names = [];
    try { names = fs.readdirSync(issuesDir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name).sort(); } catch { /* pas de dossier issues */ }
    const tickets = names.map(n => readTicket(path.join(issuesDir, n)));
    const done = new Set(tickets.filter(t => DONE.test(t.status)).map(t => normalize(t.number)));
    for (const t of tickets) {
      t.waitingOn = t.blockedBy.filter(n => !done.has(normalize(n)));
      t.state = DONE.test(t.status) ? 'done' : HUMAN.test(t.status) ? 'human' : ACTIVE.test(t.status) ? 'active'
        : BLOCKED.test(t.status) || t.waitingOn.length ? 'blocked' : 'ready';
    }
    const kind = isFile(map) ? 'wayfinder' : isFile(spec) ? 'spec' : 'notes';
    features.push({
      slug: entry.name,
      title: title(readOr(kind === 'wayfinder' ? map : spec, ''), entry.name),
      kind,
      tickets,
      counts: ['human', 'done', 'active', 'ready', 'blocked'].reduce((acc, s) => ({ ...acc, [s]: tickets.filter(t => t.state === s).length }), {}),
    });
  }
  return features;
}

const label = t => (/^\d+$/.test(t.number) ? t.number + ' ' : '') + t.title;

// Résumé de démarrage plafonné : il entre dans le contexte de chaque session.
function text(features, brief) {
  const open = features.filter(f => f.tickets.some(t => t.state !== 'done'));
  if (brief) {
    if (!open.length) return '';
    const waiting = open.flatMap(f => f.tickets.filter(t => t.state === 'human').map(t => f.slug + '/' + label(t) + ' [' + t.status + ']'));
    const lines = [];
    if (waiting.length) lines.push('À traiter en premier, une personne doit répondre ou agir : ' + waiting.slice(0, 5).join(' ; ') + (waiting.length > 5 ? ' ; +' + (waiting.length - 5) + ' autres' : ''));
    lines.push('Travaux ouverts dans .scratch (tracker local Matt) :');
    for (const f of open.slice(0, 4)) {
      const next = f.tickets.filter(t => t.state === 'active' || t.state === 'ready').slice(0, 3).map(t => label(t) + ' [' + t.state + ']');
      lines.push('- ' + f.slug + ' : ' + f.counts.done + '/' + f.tickets.length + ' terminés' + (next.length ? ' ; suivants : ' + next.join(' ; ') : ''));
    }
    if (open.length > 4) lines.push('- +' + (open.length - 4) + ' autres chantiers : node .claude/matt/board.mjs');
    lines.push('Avant de reprendre, relire le ticket et vérifier la branche et le worktree réels.');
    return lines.join('\n');
  }
  if (!features.length) return 'Aucun travail dans .scratch.';
  return features.map(f => [f.title + '  (' + f.slug + ', ' + f.kind + ')  ' + f.counts.done + '/' + f.tickets.length + ' terminés']
    .concat(f.tickets.map(t => '  ' + { human: '✋', done: '✔', active: '▶', ready: '○', blocked: '⧗' }[t.state] + ' ' + label(t) + (t.waitingOn.length ? '  (attend ' + t.waitingOn.join(', ') + ')' : '')))
    .join('\n')).join('\n\n');
}

const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Markdown des tickets → HTML : titres, listes, cases à cocher, citations, code, gras, italique, liens.
// Le texte est échappé d'abord ; le contenu des `code` est mis de côté pour ne pas être reformaté.
function inline(text) {
  const codes = [];
  return escape(text)
    .replace(/`([^`]+)`/g, (_, code) => '\u0000' + (codes.push(code) - 1) + '\u0000')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => /^(https?:\/\/|#|\.{0,2}\/(?!\/)|[\w-]+\.md$)/.test(url) ? '<a href="' + url + '">' + text + '</a>' : text)
    .replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codes[i] + '</code>');
}

// Options écrites en ligne, « (a) … ; (b) … », affichées une par ligne pour être lisibles.
function rich(text) {
  const parts = text.split(/\s*(?:^|(?<=[\s:;,.]))\(([a-f])\)\s+/);
  if (parts.length < 5) return inline(text);
  const [intro, ...rest] = parts;
  const items = [];
  for (let i = 0; i < rest.length; i += 2) items.push('<li><b>' + rest[i].toUpperCase() + '.</b> ' + inline(rest[i + 1].replace(/\s*;\s*$/, '')) + '</li>');
  return inline(intro) + '<ul class="opts">' + items.join('') + '</ul>';
}

// Réponse donnée depuis le tableau de bord : ajoutée à la fin de « ## Comments », et le ticket redevient prêt pour un agent.
export function answer(repo, relative, reply) {
  const root = fs.realpathSync(path.resolve(repo, '.scratch'));
  const candidate = path.resolve(repo, String(relative || ''));
  // realpath : une jonction ou un lien dans .scratch ne permet pas d'écrire ailleurs.
  const file = fs.existsSync(candidate) ? fs.realpathSync(candidate) : null;
  if (!file || !file.startsWith(root + path.sep) || !file.endsWith('.md') || !isFile(file)) throw new Error('Ticket introuvable');
  const textValue = String(reply || '').trim();
  if (!textValue || textValue.length > 4000) throw new Error('Réponse vide ou trop longue');
  const body = fs.readFileSync(file, 'utf8');
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  let [head, rest] = splitHead(body);
  const status = field(head, 'Status');
  if (!status || !HUMAN.test(status)) throw new Error('Ce ticket n\'attend pas de réponse');
  head = head.replace(new RegExp('^(' + FIELD('Status') + '[ \\t]*)(.+)$', 'im'), (_, prefix) => prefix + 'ready-for-agent');
  const entry = '- ' + new Date().toISOString().slice(0, 10) + ', réponse humaine (depuis le tableau de bord) :' + eol + textValue.split(/\r?\n/).map(l => '  > ' + l).join(eol) + eol;
  // Fonctions de remplacement partout : un « $' » dans la réponse ne doit pas être interprété.
  const comments = rest.search(/^## Comments\s*$/m);
  if (comments < 0) rest = rest.replace(/\s*$/, () => eol + eol + '## Comments' + eol + eol + entry);
  else {
    const after = rest.slice(comments).search(/\n##\s/);
    const end = after < 0 ? rest.length : comments + after + 1;
    rest = rest.slice(0, end).replace(/\s*$/, () => eol + eol + entry + (end < rest.length ? eol : '')) + rest.slice(end);
  }
  fs.writeFileSync(file, head + rest);
  return { file: path.relative(repo, file).split(path.sep).join('/'), status: 'ready-for-agent' };
}

export function markdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = null, paragraph = [], quote = [], code = null;
  const closeText = () => {
    if (paragraph.length) { out.push('<p>' + rich(paragraph.join(' ')) + '</p>'); paragraph = []; }
    if (quote.length) { out.push('<blockquote>' + quote.map(inline).join('<br>') + '</blockquote>'); quote = []; }
  };
  const flush = () => { closeText(); if (list) { out.push('</' + list + '>'); list = null; } };
  for (const line of lines) {
    if (code !== null) {
      if (/^```/.test(line)) { out.push('<pre><code>' + escape(code.join('\n')) + '</code></pre>'); code = null; } else code.push(line);
      continue;
    }
    if (/^```/.test(line)) { flush(); code = []; continue; }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const cite = line.match(/^\s*>\s?(.*)$/);
    const item = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/);
    if (heading) { flush(); out.push('<h' + (heading[1].length + 2) + '>' + inline(heading[2]) + '</h' + (heading[1].length + 2) + '>'); }
    else if (cite) { if (paragraph.length) closeText(); if (list) { out.push('</' + list + '>'); list = null; } quote.push(cite[1]); }
    else if (item) {
      closeText();
      const kind = item[2] ? 'ol' : 'ul';
      if (list !== kind) { if (list) out.push('</' + list + '>'); out.push('<' + kind + '>'); list = kind; }
      const box = item[3].match(/^\[( |x|X)\]\s+(.*)$/);
      out.push('<li>' + (box ? '<input type="checkbox" disabled' + (box[1] === ' ' ? '' : ' checked') + '> ' + inline(box[2]) : rich(item[3])) + '</li>');
    }
    else if (!line.trim()) flush();
    else { if (quote.length) closeText(); if (list) { out.push('</' + list + '>'); list = null; } paragraph.push(line.trim()); }
  }
  if (code !== null) out.push('<pre><code>' + escape(code.join('\n')) + '</code></pre>');
  flush();
  return out.join('');
}

// Corps du ticket sans son titre ni les champs de l'en-tête, déjà affichés en tête du panneau.
function ticketBody(t) {
  const [head, rest] = splitHead(t.text);
  return markdown(head.replace(/^#\s+.*$/m, '').replace(new RegExp('^' + FIELD('(?:Status|Blocked by|Type)') + '.*$', 'gim'), '') + rest);
}

const LABELS = { human: 'Attend un humain', ready: 'Prêt', active: 'En cours', blocked: 'Bloqué', done: 'Terminé' };

// Empreinte de l'état : la page ne se recharge que si un ticket a changé.
export function fingerprint(features) {
  return crypto.createHash('sha1').update(JSON.stringify(features.map(f => [f.slug, f.title, f.tickets.map(t => [t.number, t.text])]))).digest('hex');
}

// token : fourni seulement en mode --serve, il active le formulaire de réponse des tickets qui attendent un humain.
export function html(features, repo, token = null) {
  const name = escape(path.basename(repo));
  const rel = t => escape(path.relative(repo, t.file).split(path.sep).join('/'));
  const form = t => token && t.state === 'human'
    ? '<form class="answer" data-file="' + rel(t) + '"><label>Ta réponse</label>' +
      '<textarea rows="4" placeholder="Ex. : option A, division vraie. Le ticket repassera en Prêt pour un agent."></textarea>' +
      '<button type="submit">Envoyer la réponse</button><span class="sent"></span></form>'
    : '';
  const columns = ['human', 'ready', 'active', 'blocked', 'done'];
  const card = (f, t) => {
    const id = escape(f.slug + '-' + t.number);
    const num = /^\d+$/.test(t.number) ? escape(t.number) : '';
    return '<button class="card ' + t.state + '" data-ticket="' + id + '">' +
      '<span class="num">' + num + (t.type ? (num ? ' · ' : '') + escape(t.type) : '') + '</span>' +
      '<span class="title">' + escape(t.title) + '</span>' +
      (t.waitingOn.length ? '<span class="meta">attend ' + escape(t.waitingOn.join(', ')) + '</span>' : '') +
      '</button><template id="t-' + id + '"><p class="crumb">' + escape(f.title) + (num ? ' · ticket ' + num : '') + '</p><h2>' + escape(t.title) + '</h2>' +
      '<p><span class="pill ' + t.state + '">' + LABELS[t.state] + '</span> <code>' + escape(t.status) + '</code>' + (t.waitingOn.length ? ' · attend ' + escape(t.waitingOn.join(', ')) : '') + '</p>' +
      '<div class="md">' + ticketBody(t) + '</div>' + form(t) + '<p class="path">' + rel(t) + '</p></template>';
  };
  const waiting = features.reduce((n, f) => n + f.counts.human, 0);
  const body = features.length ? features.map(f =>
    '<section><header><h2>' + escape(f.title) + '</h2><span class="meta">' + escape(f.slug) + ' · ' + f.counts.done + '/' + f.tickets.length + ' terminés</span>' +
    '<div class="bar"><i style="width:' + (f.tickets.length ? Math.round(100 * f.counts.done / f.tickets.length) : 0) + '%"></i></div></header>' +
    '<div class="cols">' + columns.map(state => '<div class="col ' + state + '"><h3>' + LABELS[state] + ' <b>' + f.counts[state] + '</b></h3>' +
      (f.tickets.filter(t => t.state === state).map(t => card(f, t)).join('') || '<p class="empty">—</p>') + '</div>').join('') +
    '</div></section>').join('') : '<p class="empty">Aucun travail dans .scratch.</p>';
  return '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Suivi · ' + name + '</title><style>' +
    ':root{--bg:#f6f6f3;--fg:#1c1c1a;--card:#fff;--line:#e2e1dc;--muted:#76756f;--human:#db2777;--ready:#2563eb;--active:#d97706;--blocked:#8b8a84;--done:#16a34a}' +
    '@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--card:#1f1f1d;--line:#33332f;--muted:#9a998f;--human:#f472b6;--ready:#60a5fa;--active:#fbbf24;--blocked:#a3a29b;--done:#4ade80}}' +
    '*{box-sizing:border-box}body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:20px;background:var(--bg);color:var(--fg)}' +
    'h1{font-size:20px;margin:0 0 4px}.top{display:flex;align-items:baseline;gap:12px;margin-bottom:20px}.alert{color:var(--human);font-weight:600}' +
    'section{margin-bottom:28px}header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;margin-bottom:12px}header h2{font-size:16px;margin:0}' +
    '.meta{color:var(--muted);font-size:12px}.bar{flex-basis:100%;height:4px;background:var(--line);border-radius:2px}.bar i{display:block;height:100%;background:var(--done);border-radius:2px}' +
    '.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}' +
    '.col h3{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid var(--line)}.col h3 b{font-weight:normal}' +
    '.col.human h3{color:var(--human);border-color:var(--human)}' +
    '.card{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer}' +
    '.card:hover{border-color:var(--c)}.card .num{display:block;font-size:11px;color:var(--muted)}.card .title{display:block;font-weight:500}.card .meta{display:block;margin-top:4px}' +
    '.human{--c:var(--human)}.ready{--c:var(--ready)}.active{--c:var(--active)}.blocked{--c:var(--blocked)}.done{--c:var(--done)}.card.done{opacity:.65}.empty{color:var(--muted)}' +
    '#panel{position:fixed;top:0;right:0;height:100%;width:min(560px,100%);background:var(--card);border-left:1px solid var(--line);box-shadow:-8px 0 24px rgba(0,0,0,.12);padding:24px;overflow:auto;transform:translateX(100%);transition:transform .2s}' +
    '#panel.open{transform:none}#close{position:absolute;top:12px;right:12px;border:0;background:none;font-size:22px;color:var(--muted);cursor:pointer}' +
    '#panel h2{margin:4px 0 8px;font-size:18px}.crumb,.path{color:var(--muted);font-size:12px;margin:0}.path{margin-top:24px}' +
    '.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;color:#fff;background:var(--c)}' +
    '.md h3,.md h4,.md h5{font-size:14px;margin:18px 0 6px}.md ul,.md ol{padding-left:20px}.md li{margin:4px 0}' +
    '.md ul.opts{list-style:none;padding:0;margin:8px 0}.md ul.opts li{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 10px;margin:6px 0}' +
    '.md blockquote{margin:6px 0 6px 20px;padding:6px 10px;border-left:3px solid var(--human);background:var(--bg);border-radius:0 6px 6px 0}' +
    '.answer{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}.answer label{display:block;font-weight:600;margin-bottom:6px}' +
    '.answer textarea{width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px}' +
    '.answer button{margin-top:8px;font:inherit;font-weight:600;color:#fff;background:var(--human);border:0;border-radius:6px;padding:6px 14px;cursor:pointer}.sent{margin-left:10px;color:var(--muted)}' +
    'code{font:12px ui-monospace,monospace;background:var(--bg);padding:1px 4px;border-radius:4px}pre{background:var(--bg);padding:10px;border-radius:6px;overflow:auto}pre code{padding:0}a{color:var(--ready)}' +
    '@media (max-width:700px){body{padding:16px}}' +
    '</style><div class="top"><h1>Suivi · ' + name + '</h1>' + (waiting ? '<span class="alert">' + waiting + ' en attente d’une réponse</span>' : '') + '</div>' + body +
    '<aside id="panel" aria-live="polite"><button id="close" aria-label="Fermer">×</button><div id="content"></div></aside>' +
    '<script>const panel=document.getElementById("panel"),content=document.getElementById("content");' +
    'document.addEventListener("click",e=>{const c=e.target.closest(".card");if(c){content.innerHTML=document.getElementById("t-"+c.dataset.ticket).innerHTML;panel.classList.add("open");history.replaceState(null,"","#"+c.dataset.ticket)}else if(e.target.id==="close"||!e.target.closest("#panel")){panel.classList.remove("open");history.replaceState(null,""," ")}});' +
    'document.addEventListener("keydown",e=>{if(e.key==="Escape")panel.classList.remove("open")});' +
    'const open=location.hash.slice(1);if(open&&document.getElementById("t-"+open)){content.innerHTML=document.getElementById("t-"+open).innerHTML;panel.classList.add("open")}' +
    'document.addEventListener("submit",async e=>{e.preventDefault();const f=e.target,out=f.querySelector(".sent"),text=f.querySelector("textarea").value.trim();if(!text)return;out.textContent="Envoi…";' +
    'const r=await fetch("/answer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:' + JSON.stringify(token) + ',file:f.dataset.file,text})});' +
    'const j=await r.json().catch(()=>({error:"Réponse illisible"}));if(r.ok){out.textContent="Enregistré : le ticket repasse en Prêt.";setTimeout(()=>{panel.classList.remove("open");location.hash="";location.reload()},1200)}else out.textContent="Erreur : "+j.error});' +
    (token ? 'const state=' + JSON.stringify(fingerprint(features)) + ';setInterval(async()=>{if(panel.classList.contains("open"))return;const r=await fetch("/state").catch(()=>null);if(r&&r.ok&&await r.text()!==state)location.reload()},3000)' : '') +
    '</script></html>';
}

function main(args) {
  const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (args.includes('--serve')) {
    const port = Number(args[args.indexOf('--serve') + 1]) || 4545;
    // Jeton aléatoire par lancement + contrôle de l'hôte et de l'origine : une autre page web ne peut pas écrire dans les tickets.
    const token = crypto.randomBytes(16).toString('hex');
    const local = ['127.0.0.1:' + port, 'localhost:' + port];
    http.createServer((req, res) => {
      const reply = (code, type, body) => { res.writeHead(code, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store' }); res.end(body); };
      try {
        if (!local.includes(String(req.headers.host || '').toLowerCase())) return reply(403, 'text/plain', 'Hôte refusé');
        if (req.method === 'GET' && req.url === '/state') return reply(200, 'text/plain', fingerprint(board(repo)));
        if (req.method === 'POST' && req.url === '/answer') {
          const origin = String(req.headers.origin || '').toLowerCase();
          if (origin && !local.some(h => origin === 'http://' + h)) return reply(403, 'application/json', '{"error":"Origine refusée"}');
          let raw = '';
          req.on('data', chunk => { raw += chunk; if (raw.length > 20000) req.destroy(); });
          req.on('end', () => {
            let request;
            try { request = JSON.parse(raw); } catch { return reply(400, 'application/json', '{"error":"Requête invalide"}'); }
            try {
              if (request?.token !== token) throw new Error('Jeton invalide, recharger la page');
              reply(200, 'application/json', JSON.stringify(answer(repo, request.file, request.text)));
            } catch (error) { reply(400, 'application/json', JSON.stringify({ error: error.message })); }
          });
          return;
        }
        reply(200, 'text/html', html(board(repo), repo, token));
      } catch (error) { reply(500, 'text/plain', 'Erreur de lecture : ' + error.message); }
    }).listen(port, '127.0.0.1', () => console.log('Tableau de bord : http://127.0.0.1:' + port));
    return;
  }
  const features = board(repo);
  if (args.includes('--json')) return void process.stdout.write(JSON.stringify(features.map(f => ({ ...f, tickets: f.tickets.map(({ text, ...t }) => t) })), null, 2) + '\n');
  const out = text(features, args.includes('--brief'));
  if (out) process.stdout.write(out + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write('board: ' + error.message + '\n'); }
}
