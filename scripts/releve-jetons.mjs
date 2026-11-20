#!/usr/bin/env node
// Relevé des jetons consommés par Claude Code sur ce dépôt, par séance.
//
// ⭐ POURQUOI. Le relevé de temps (`docs/TIMELOG.md`) dit combien de temps une
// tâche a pris ; ce relevé dit combien de jetons elle a consommés. Les deux
// alimenteront FixTracker, tâche par tâche, quand le projet y existera
// (décision du 2026-11-20). Ne JAMAIS inventer un chiffre : il se lit dans les
// journaux de session, et nulle part ailleurs.
//
// ⚠️ SOURCE. Chaque réponse du modèle est écrite, avec son `usage` et son
// horodatage, dans les journaux de Claude Code :
//   ~/.claude/projects/<dossier du dépôt>/<session>.jsonl            (session)
//   ~/.claude/projects/<dossier du dépôt>/<session>/subagents/*.jsonl (agents)
// Une même réponse peut apparaître sur plusieurs lignes (flux), et peut-être
// dans deux fichiers (session reprise) : on dédoublonne par `requestId` +
// `message.id`, tous fichiers confondus.
//
// ⚠️ CE QUI N'Y EST PAS : les sessions cloud (elles tournent ailleurs) et les
// sessions ouvertes dans un autre dossier (ex. TEMPLATE-EPSS). Le relevé le
// dit en pied de tableau.
//
// Séances : même seuil que `timelog-rollup.mjs` (nouvelle séance après plus
// de 30 minutes), mais calculé sur les réponses du modèle seulement — le
// rollup du TIMELOG compte aussi les messages de l'utilisateur. Les bornes
// peuvent donc différer de quelques minutes. Le filtre par jour (heure locale)
// passe AVANT le découpage : une séance qui franchit minuit compte pour deux
// jours, comme dans un relevé journalier.
//
//   node scripts/releve-jetons.mjs AAAA-MM-JJ          (un jour, heure locale)
//   node scripts/releve-jetons.mjs AAAA-MM-JJ --detail (avec les sous-agents)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const jour = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(jour ?? '')) {
  console.error('Usage : node scripts/releve-jetons.mjs AAAA-MM-JJ [--detail]');
  process.exit(1);
}
const detail = process.argv.includes('--detail');
const ECART_MS = 30 * 60 * 1000;

// Le dossier de journaux d'un dépôt est son chemin absolu, chaque caractère
// non alphanumérique remplacé par `-`. On part de la RACINE du dépôt (pas du
// dossier courant), et on ajoute ses worktrees (`.claude/worktrees/*`), comme
// le relevé de temps qui les regroupe avec le dépôt.
const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const cleDossier = (chemin) => chemin.replace(/[^a-zA-Z0-9]/g, '-');
const projets = join(homedir(), '.claude', 'projects');
const base = cleDossier(racine);
const dossiers = existsSync(projets)
  ? readdirSync(projets)
      .filter((n) => n === base || n.startsWith(cleDossier(join(racine, '.claude', 'worktrees')) + '-'))
      .map((n) => join(projets, n))
  : [];
if (!dossiers.length) {
  console.error(`Aucun journal de session pour ce dépôt : ${join(projets, base)}`);
  process.exit(1);
}

function journaux() {
  const fichiers = [];
  for (const dossier of dossiers) for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (nom.endsWith('.jsonl')) fichiers.push({ chemin, source: 'session' });
    const agents = join(chemin, 'subagents');
    if (existsSync(agents)) {
      for (const a of readdirSync(agents)) {
        if (a.endsWith('.jsonl')) fichiers.push({ chemin: join(agents, a), source: 'agent' });
      }
    }
  }
  return fichiers;
}

const vus = new Set();
const reponses = [];
for (const { chemin, source } of journaux()) {
  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    if (!ligne.trim()) continue;
    let d;
    try {
      d = JSON.parse(ligne);
    } catch {
      continue;
    }
    const u = d?.message?.usage;
    if (!u || !d.timestamp) continue;
    // Sans identifiant, on ne peut pas dédoublonner : la ligne compte seule.
    const cle = d.requestId || d.message?.id ? `${d.requestId ?? ''}|${d.message?.id ?? ''}` : `${chemin}|${ligne.length}|${d.timestamp}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const t = new Date(d.timestamp);
    // Jour en heure locale, comme le relevé de temps.
    const local = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (local !== jour) continue;
    reponses.push({
      t,
      source,
      entree: u.input_tokens ?? 0,
      cacheEcrit: u.cache_creation_input_tokens ?? 0,
      cacheLu: u.cache_read_input_tokens ?? 0,
      sortie: u.output_tokens ?? 0,
    });
  }
}
reponses.sort((a, b) => a.t - b.t);

const seances = [];
for (const r of reponses) {
  const s = seances.at(-1);
  if (s && r.t - s.fin <= ECART_MS) {
    s.fin = r.t;
    s.items.push(r);
  } else seances.push({ debut: r.t, fin: r.t, items: [r] });
}

const hm = (t) => t.toTimeString().slice(0, 5);
// Valeurs exactes (séparateur de milliers) : FixTracker les reprendra telles quelles.
const k = (n) => n.toLocaleString('fr-FR');
const somme = (items, champ) => items.reduce((a, r) => a + r[champ], 0);

console.log(`## ${jour} — jetons par séance\n`);
console.log('| Début | Fin | Réponses | Entrée | Cache écrit | Cache lu | Sortie |' + (detail ? ' dont agents (sortie) |' : ''));
console.log('| --- | --- | --- | --- | --- | --- | --- |' + (detail ? ' --- |' : ''));
for (const s of seances) {
  const agents = s.items.filter((r) => r.source === 'agent');
  console.log(
    `| ${hm(s.debut)} | ${hm(s.fin)} | ${s.items.length} | ${k(somme(s.items, 'entree'))} | ` +
      `${k(somme(s.items, 'cacheEcrit'))} | ${k(somme(s.items, 'cacheLu'))} | ${k(somme(s.items, 'sortie'))} |` +
      (detail ? ` ${k(somme(agents, 'sortie'))} |` : ''),
  );
}
console.log(
  `\nTotal : ${reponses.length} réponses ; entrée ${k(somme(reponses, 'entree'))}, ` +
    `cache écrit ${k(somme(reponses, 'cacheEcrit'))}, cache lu ${k(somme(reponses, 'cacheLu'))}, ` +
    `sortie ${k(somme(reponses, 'sortie'))}.`,
);
console.log('Hors relevé : sessions cloud et sessions ouvertes dans un autre dossier.');
