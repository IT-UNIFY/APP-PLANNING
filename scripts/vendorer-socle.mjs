// Vendoring du socle commun — recopie contrôlée, et AUCUN jeton au build.
//
// ⭐ LE PROBLÈME QU'IL RÈGLE, mesuré le 2026-09-09 (ADR-001 D16, rouverte).
// Consommer `@it-unify/boilerplate-kit` depuis le registre privé oblige à poser
// un `GITHUB_PACKAGES_TOKEN` (`read:packages`) dans CHAQUE environnement qui
// construit — y compris l'image Docker du front. Un PAT GitHub expire à 90
// jours, et sur un site destiné à un client il faudrait lui confier un
// identifiant de l'organisation.
//
// Le vendoring déplace le jeton : il ne sert plus qu'à SYNCHRONISER, sur une
// machine de mainteneur, jamais à construire. Le dépôt porte les sources.
//
// ⚠️ CE QUI EST VENDORISÉ, ET POURQUOI DES `.ts` ET NON DU JS COMPILÉ.
// Le paquet publie `dist` (JS + `.d.ts`) ET `src` (TypeScript). La carte
// `exports` ne pointe que sur `dist`, donc un consommateur npm reçoit du JS —
// c'est la contrainte 1 d'ADR-001 D4, Deno refusant de dépouiller les types
// SOUS `node_modules`. Le vendoring, lui, copie les `.ts` de `src` : hors
// `node_modules`, Deno les type-vérifie sans problème, et le front les compile
// comme n'importe quelle source. Vendoriser le JS compilé obligerait à semer
// des directives `@deno-types` à chaque import.
//
// ⚠️ OÙ, ET CE N'EST PAS ARBITRAIRE. Une seule copie, sous
// `supabase/functions/_shared/socle/`. Le bundler des Edge Functions suit les
// imports mais reste dans le projet Supabase ; un chemin relatif sortant de
// `supabase/` est un risque inutile. Le FRONT, lui, importe de n'importe où :
// il atteint la même copie par l'alias `@socle/*`. C'est le côté souple qui
// s'adapte au côté rigide, pas l'inverse.
//
// ⭐ DEUX MODES, ET LEUR SÉPARATION EST LE CŒUR DU DISPOSITIF.
//
//   défaut          — CONTRÔLE D'INTÉGRITÉ. Recalcule l'empreinte de l'arbre
//                     vendorisé et la compare à `EMPREINTES.json`. Hors ligne,
//                     sans jeton, sans réseau. C'est ce mode qui entre dans
//                     `npm run verify`.
//   --synchroniser  — RECOPIE depuis le paquet installé. Demande le paquet,
//                     donc le jeton. Geste de mainteneur, jamais de build.
//
// 🔴 POURQUOI `verify` NE COMPARE PAS À L'AMONT. ADR-001 écrivait d'abord
// « `npm run verify` échoue si le fichier généré diffère du paquet installé ».
// Cela aurait exigé le paquet — donc le jeton — à chaque vérification, et
// annulé tout le bénéfice. Le contrôle de `verify` protège contre ce qui
// arrive vraiment : une édition locale du code généré. La comparaison avec
// l'amont est un geste séparé, `--comparer-amont`, fait par qui a le jeton.
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative } from 'node:path';

const MANIFESTE = 'socle.json';
const CIBLE = join('supabase', 'functions', '_shared', 'socle');
const EMPREINTES = join(CIBLE, 'EMPREINTES.json');
// 🔴 IL PEUT Y AVOIR PLUSIEURS CARTES D'IMPORTS, et c'est le cas courant.
// Ce script n'en connaissait qu'une jusqu'au 2026-09-10 — signalé par
// APP-FACTU après une porte rouge que la sortie de `socle:sync` ne pouvait pas
// expliquer : ils avaient ajouté `jose` là où le script le demandait, et
// `deno check` continuait de rendre « Import "jose" not a dependency and not
// in import map ». Message qui affirme que l'entrée manque ALORS QU'ELLE
// EXISTE — dans l'autre carte.
//
// POURQUOI DEUX CARTES. Celle du DÉPLOIEMENT (`supabase/functions/deno.json`)
// et celle de la PORTE, qui doit en plus résoudre les dépendances des
// `*.test.ts` (`vitest` en spécificateur nu) pour tout vérifier en un
// passage. Mettre un paquet de test dans la config déployée serait pire.
// APP-MSP et APP-FACTU ont tous deux cette paire.
//
// ⚠️ ON NE CHERCHE PAS PAR NOM DE FICHIER, ET C'EST DÉLIBÉRÉ. La suggestion
// reçue était « chercher `deno.json`/`deno.jsonc` sous `supabase/` et
// `scripts/` ». Elle aurait raté leur propre fichier, qui s'appelle
// `scripts/deno-check.json`. On découvre donc par CONTENU : tout `.json` du
// dépôt dont la racine porte un objet `imports` EST une carte d'imports.
// C'est encore la même leçon — un motif bâti sur les cas connus rate le cas
// suivant.
const RACINE_CIBLE = join('supabase', 'functions', '_shared', 'socle');
const IGNORES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);
const PAQUET = '@it-unify/boilerplate-kit';

const BANDEAU = (sousChemin, version) =>
  `// ═══════════════════════════════════════════════════════════════════════\n` +
  `// GÉNÉRÉ — NE PAS ÉDITER.\n` +
  `//\n` +
  `// Recopié depuis ${PAQUET}@${version} (${sousChemin}) par\n` +
  `// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la\n` +
  `// prochaine synchronisation, et fait ÉCHOUER \`npm run verify\` d'ici là.\n` +
  `//\n` +
  `// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),\n` +
  `// publier une version, puis \`npm run socle:sync\`.\n` +
  `// ═══════════════════════════════════════════════════════════════════════\n`;

/**
 * Réécrit `./x.js` en `./x.ts` dans les spécificateurs RELATIFS.
 *
 * 🔴 SANS ÇA, LA COPIE VENDORISÉE NE COMPILE PAS — signalé par APP-FACTU le
 * 2026-09-09, qui l'a payé : `deno check` rend
 * `TS2307 Cannot find module '…/etat.js'. Maybe change the extension to '.ts'`.
 *
 * POURQUOI. Les sources du paquet s'importent entre elles en `.js`, convention
 * TypeScript/Node ESM (`from './etat.js'` désigne `etat.ts`). Deno tolère cette
 * forme **sous** `node_modules` et la **refuse** hors de `node_modules` — or le
 * vendoring copie précisément hors de `node_modules`.
 *
 * ⚠️ MA PROPRE DOCUMENTATION S'EST TROMPÉE ICI, et il faut le dire : ADR-001
 * D16 écrit « le vendoring copie hors node_modules, où la limite ne s'applique
 * pas ». C'est vrai de la limite sur les **types**. Celle sur les
 * **extensions** fait l'inverse : elle n existe QUE hors de `node_modules`.
 *
 * ⭐ SEULS LES SPÉCIFICATEURS RELATIFS SONT TOUCHÉS. Un spécificateur nu
 * (`@supabase/supabase-js`, `jose`) se résout par la carte d imports du projet
 * et ne doit pas être réécrit. La réécriture est déterministe, donc les
 * empreintes restent stables d une synchronisation à l autre.
 *
 * Couvre `from`, `export … from` et l `import()` dynamique, en guillemets
 * simples ET doubles. Les backticks ne sont pas couverts : un spécificateur de
 * module ne peut pas être un gabarit, sauf en `import()` dynamique — cas
 * qu aucun module du socle n emploie, et qui échouerait franchement au
 * `deno check` plutôt qu en silence.
 */
function reecrireExtensions(source) {
  return source.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]*)\.js\2/g,
    (_m, tete, guillemet, chemin) => tete + guillemet + chemin + '.ts' + guillemet,
  );
}

/**
 * Relève les spécificateurs NUS importés par le code vendorisé.
 *
 * 🔴 LE TROISIÈME TROU DU VENDORING, mesuré le 2026-09-09 (B23) en éprouvant le
 * correctif du deuxième sur `m365-auth` — le sous-chemin le plus riche, et non
 * le plus commode. `deno check` rendait :
 *
 *     error: Failed resolving types. Could not resolve "@supabase/supabase-js",
 *     but found it in a package.json.
 *
 * ⚠️ LE MÊME DÉFAUT PARLE DE DEUX VOIX, et il faut connaître les deux, sinon on
 * cherche deux causes. La forme ci-dessus sort quand le paquet EST dans le
 * `package.json` du projet (cas d'APP-FACTU). Quand il n'y est pas, Deno 2.9.5
 * dit plutôt (mesuré le 2026-09-10) :
 *
 *     TS2307 Import "@supabase/supabase-js" not a dependency and not in import
 *     map from "…/socle/m365-auth/terminerConnexionM365.ts"
 *
 * Le premier message accuse le paquet, le second suggère un `deno add` : aucun
 * des deux ne nomme la carte du projet, qui est pourtant le seul bon endroit.
 * Sous `node_modules`, Deno résout un spécificateur nu tout seul ;
 * hors de `node_modules` — là où le vendoring copie — il exige une entrée. Y
 * compris pour un `import type` : le type doit bien se résoudre quelque part.
 *
 * ⭐ POURQUOI DÉTECTER PLUTÔT QUE RAPPELER. Ce script portait déjà un rappel
 * générique (« le code vendorisé attend `jose` et `@supabase/supabase-js` »).
 * Il disait la bonne chose sans dire OÙ l'écrire, et sans dire laquelle des
 * deux manquait vraiment. La détection lit les fichiers qu'on vient de poser :
 * elle ne peut pas prendre du retard sur le socle, et elle nomme la ligne
 * exacte à coller.
 *
 * Couvre `from`, `export … from`, l'`import()` dynamique et l'import à effet de
 * bord (`import 'x'`), en guillemets simples ET doubles. Les spécificateurs
 * relatifs et ceux que Deno résout seul (`npm:`, `jsr:`, `node:`, une URL) sont
 * écartés : ils n'ont besoin d'aucune entrée.
 */
const DEJA_RESOLU = /^(?:npm:|jsr:|node:|https?:|data:|file:|blob:)/;

function specificateursNus(source) {
  const trouves = new Set();
  const motifs = [
    /(?:\bfrom\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g,
    /^\s*import\s+(['"])([^'"]+)\1/gm,
  ];
  for (const motif of motifs) {
    for (const [, , spec] of source.matchAll(motif)) {
      if (spec.startsWith('.') || spec.startsWith('/')) continue;
      if (DEJA_RESOLU.test(spec)) continue;
      trouves.add(spec);
    }
  }
  return trouves;
}

/** `@supabase/supabase-js/dist/x` → `@supabase/supabase-js` ; `jose/y` → `jose`. */
function nomPaquet(spec) {
  const morceaux = spec.split('/');
  return spec.startsWith('@') ? morceaux.slice(0, 2).join('/') : morceaux[0];
}

/**
 * Construit l'entrée `npm:` à coller, en DÉRIVANT la version du paquet du socle
 * lui-même — jamais d'une liste écrite à la main ici, qui prendrait du retard à
 * la première montée de version. `jose` est une dépendance du socle,
 * `@supabase/supabase-js` une pair-dépendance : les deux sont lues.
 */
function entreeNpm(pjPaquet, spec) {
  const nom = nomPaquet(spec);
  const plage =
    pjPaquet.dependencies?.[nom] ??
    pjPaquet.peerDependencies?.[nom] ??
    pjPaquet.devDependencies?.[nom];
  const majeur = plage?.match(/(\d+)/)?.[1];
  const cible = majeur ? `${nom}@${majeur}` : nom;
  return spec === nom ? `npm:${cible}` : `npm:${cible}/${spec.slice(nom.length + 1)}`;
}

/**
 * La carte résout-elle ce spécificateur ? Trois formes valent, et les trois
 * sont acceptées pour ne pas rendre la porte rouge sur une carte correcte :
 * la clé EXACTE, une clé PRÉFIXE terminée par `/`, ou une entrée sous `scopes`.
 */
function carteResout(carte, spec) {
  const resout = (imports) =>
    Object.keys(imports ?? {}).some(
      (cle) => cle === spec || (cle.endsWith('/') && spec.startsWith(cle)),
    );
  if (resout(carte.imports)) return true;
  return Object.values(carte.scopes ?? {}).some(resout);
}

/**
 * Lit un JSON qui peut porter des COMMENTAIRES (JSONC).
 *
 * 🔴 SANS ÇA, DEUX CONTRÔLES DE CE SCRIPT SONT DU CODE MORT — trouvé le
 * 2026-09-10 en éprouvant l'avertissement `tsconfig` qui venait d'être écrit :
 * il ne se déclenchait jamais. Le `tsconfig.app.json` du squelette porte des
 * commentaires `/* … *\/`, `JSON.parse` échoue, et un `catch` qui passe au
 * suivant transforme le contrôle en silence.
 *
 * Même cécité sur la découverte des cartes : un `deno.jsonc` commenté — forme
 * que Deno accepte — serait sauté sans un mot, et c'est précisément la carte
 * oubliée qu'on cherche à nommer.
 *
 * ⚠️ Le retrait est TEXTUEL et volontairement modeste : il respecte les
 * chaînes et les échappements, pas les cas tordus. On ne réécrit jamais le
 * fichier à partir de ce résultat — il ne sert qu'à LIRE. Un faux négatif
 * coûte un avertissement manqué, jamais un fichier abîmé.
 */
function lireJsonc(chemin) {
  const brut = readFileSync(chemin, 'utf8');
  let out = '';
  let dansChaine = false;
  let echappe = false;
  let commentaire = null;   // 'ligne' | 'bloc' | null
  for (let i = 0; i < brut.length; i += 1) {
    const c = brut[i];
    const suivant = brut[i + 1];
    if (commentaire === 'ligne') {
      if (c === '\n') { commentaire = null; out += c; }
      continue;
    }
    if (commentaire === 'bloc') {
      if (c === '*' && suivant === '/') { commentaire = null; i += 1; }
      continue;
    }
    if (dansChaine) {
      out += c;
      if (echappe) echappe = false;
      else if (c === '\\') echappe = true;
      else if (c === '"') dansChaine = false;
      continue;
    }
    if (c === '"') { dansChaine = true; out += c; continue; }
    if (c === '/' && suivant === '/') { commentaire = 'ligne'; i += 1; continue; }
    if (c === '/' && suivant === '*') { commentaire = 'bloc'; i += 1; continue; }
    out += c;
  }
  // Virgules traînantes, tolérées par JSONC et refusées par JSON.parse.
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * Toutes les cartes d'imports du dépôt, découvertes par CONTENU.
 *
 * Un `.json` dont la racine porte un objet `imports` EST une carte d'imports,
 * quel que soit son nom. C'est ce qui rattrape `scripts/deno-check.json`,
 * qu'un motif sur `deno.json*` raterait — voir le commentaire de `IGNORES`.
 *
 * Le fichier de `package.json` porte parfois un champ `imports` (les
 * *subpath imports* de Node) : il est écarté par son nom, sinon on
 * réclamerait des entrées Deno dans un fichier npm.
 */
function cartesDuDepot(dossier = '.', profondeur = 0, trouvees = []) {
  if (profondeur > 4) return trouvees;
  let entrees;
  try {
    entrees = readdirSync(dossier, { withFileTypes: true });
  } catch {
    return trouvees;
  }
  for (const e of entrees) {
    const chemin = join(dossier, e.name).replace(/^\.\//, '');
    if (e.isDirectory()) {
      if (IGNORES.has(e.name) || e.name.startsWith('.')) continue;
      if (chemin === RACINE_CIBLE) continue;   // l'arbre vendorisé, pas une config
      cartesDuDepot(chemin, profondeur + 1, trouvees);
      continue;
    }
    if (!e.name.endsWith('.json')) continue;
    if (e.name === 'package.json' || e.name === 'package-lock.json') continue;
    try {
      const contenu = lireJsonc(chemin);
      if (contenu && typeof contenu.imports === 'object' && contenu.imports !== null) {
        trouvees.push({ chemin, contenu });
      }
    } catch {
      // Vraiment illisible (ni JSON ni JSONC). On ne bloque pas dessus —
      // `deno check` le fera, et bruyamment.
    }
  }
  return trouvees;
}

/**
 * Rend le bloc de texte qui NOMME les entrées manquantes, ou `null` si tout
 * est résolu. Partagé par la synchronisation (qui informe) et le contrôle
 * (qui refuse) : un seul texte, donc un seul endroit à corriger.
 *
 * 🔴 CHAQUE CARTE EST CONTRÔLÉE SÉPARÉMENT. Une entrée posée dans la carte du
 * déploiement ne sert pas à la porte de vérification, et l'inverse est vrai
 * aussi. Le message nomme donc le FICHIER en plus de la ligne — sans quoi on
 * ajoute l'entrée au mauvais endroit et le message ne change pas.
 */
function diagnosticCarte(entreesRequises) {
  const requis = Object.entries(entreesRequises ?? {});
  if (requis.length === 0) return null;
  const cartes = cartesDuDepot();

  if (cartes.length === 0) {
    return (
      `socle — le code vendorisé importe ${requis.length} spécificateur(s) nu(s), ` +
      `mais AUCUNE carte d'imports n'a été trouvée dans le dépôt.\n` +
      `  Hors de \`node_modules\`, Deno exige une entrée pour chacun — y compris ` +
      `en \`import type\`.\n  Créer \`supabase/functions/deno.json\` avec :\n\n` +
      JSON.stringify({ imports: Object.fromEntries(requis) }, null, 2)
        .split('\n').map((l) => `    ${l}`).join('\n')
    );
  }

  const blocs = [];
  for (const { chemin, contenu } of cartes) {
    const manquants = requis.filter(([spec]) => !carteResout(contenu, spec));
    if (manquants.length === 0) continue;
    blocs.push(
      `  ── ${chemin} ──\n` +
      manquants.map(([spec, entree]) => `      "${spec}": "${entree}",`).join('\n'),
    );
  }
  if (blocs.length === 0) return null;

  return (
    `socle — des spécificateurs nus du code vendorisé ne sont pas résolus par ` +
    `${blocs.length} carte(s) sur ${cartes.length} :\n\n` +
    blocs.join('\n\n') +
    `\n\n  Ajouter ces lignes sous \`imports\`, DANS CHAQUE FICHIER NOMMÉ.\n` +
    `  ⚠️ Un dépôt a souvent DEUX cartes — celle du déploiement et celle de la ` +
    `porte de\n     vérification (qui doit en plus résoudre les dépendances ` +
    `des tests). Poser\n     l'entrée dans une seule laisse l'autre rouge, sur ` +
    `un message qui affirme que\n     l'entrée manque alors qu'elle existe — ` +
    `dans l'autre fichier.\n` +
    `  Sans elles, \`deno check\` échoue sur « Could not resolve "…" » ou ` +
    `« not a\n  dependency and not in import map ».`
  );
}

/**
 * Le front type-vérifie-t-il tout le dossier du socle ?
 *
 * 🔴 UN QUATRIÈME EMPLACEMENT DE CONFIGURATION, signalé par APP-FACTU le
 * 2026-09-10. Leur `tsconfig.app.json` incluait
 * `supabase/functions/_shared/socle` en entier : `tsc -b` compilait alors
 * `edge/mint-jwt`, que le front n'importe JAMAIS, et cassait sur
 * `TS2307 Cannot find module 'jose'`. La carte d'imports ne sauve pas ce
 * cas — elle ne vaut que pour Deno.
 *
 * La bonne forme est `include: ["src", "tests"]` : l'alias `@socle/*` suffit,
 * et TypeScript ne compile alors que les fichiers réellement importés. Le
 * squelette la porte ; ce contrôle existe pour le projet qui en a dévié.
 *
 * Simple avertissement, jamais un refus : un projet peut avoir une raison de
 * tout inclure, et ce n'est pas à ce script d'en décider.
 */
function avertirTsconfig() {
  for (const nom of ['tsconfig.app.json', 'tsconfig.json']) {
    if (!existsSync(nom)) continue;
    let conf;
    try {
      conf = lireJsonc(nom);
    } catch {
      continue;
    }
    const inclus = (conf.include ?? []).some(
      (i) => typeof i === 'string' && i.replace(/\\/g, '/').includes('_shared/socle'),
    );
    if (!inclus) continue;
    console.log(
      `\n  ⚠️ ${nom} inclut le dossier du socle EN ENTIER.\n` +
      `     \`tsc -b\` compilera alors des sous-chemins que le front n'importe\n` +
      `     pas — un \`edge/*\` à spécificateur nu casse sur « Cannot find\n` +
      `     module ». La carte d'imports ne sauve pas ce cas : elle ne vaut\n` +
      `     que pour Deno.\n` +
      `     Forme attendue : include ["src", "tests"], l'alias \`@socle/*\`\n` +
      `     suffisant à atteindre la copie. Mesuré chez APP-FACTU le 2026-09-10.`,
    );
  }
}

/**
 * Où vit, dans `src/`, le code d'un sous-chemin de la carte `exports` ?
 *
 * 🔴 LE QUATRIÈME TROU DU VENDORING, mesuré le 2026-09-10 (B23) — et trouvé par
 * la même méthode que le troisième : en éprouvant enfin les sous-chemins qu'on
 * n'avait jamais pris. Ce script DEVINAIT le chemin source en collant le nom du
 * sous-chemin derrière `src/`. La devinette tient pour `edge/cors`
 * (`src/edge/cors.ts`) et pour `m365-auth` (`src/m365-auth/`) — les seuls
 * jamais vendorisés. Elle tombe pour les deux autres :
 *
 *     edge/mint-jwt      → src/edge/mintJwt.ts        (et non mint-jwt.ts)
 *     client/erreur-edge → src/client/erreurEdge.ts   (et non erreur-edge.ts)
 *
 * Le nom d'un sous-chemin `exports` est en tiret-minuscule, celui d'un fichier
 * TypeScript en casse chameau : rien ne les oblige à coïncider, et pour deux
 * des sept sous-chemins ils ne coïncident pas. Résultat, `socle:sync` refusait
 * net — « sous-chemin inconnu dans le paquet » — sur du code parfaitement
 * publié. **Deux des sept sous-chemins du socle étaient inatteignables.**
 *
 * ⭐ ON NE DEVINE PLUS, ON LIT LA CARTE `exports`, qui fait autorité : c'est
 * elle qui définit ce qu'est un sous-chemin. `./dist/edge/mintJwt.d.ts` donne
 * `src/edge/mintJwt.ts` par deux substitutions mécaniques. Un sous-chemin
 * absent de la carte n'existe pas — on le refuse en listant ceux qui existent,
 * au lieu de laisser croire à un chemin mal formé.
 *
 * Le cas BARILLET reste distingué : quand la carte désigne un `index.ts`, c'est
 * tout son DOSSIER qu'il faut recopier, sinon les modules qu'il réexporte
 * manquent.
 */
function resoudreSource(pjPaquet, srcPaquet, sousChemin) {
  const entree = pjPaquet.exports?.[`./${sousChemin}`];
  const declare =
    typeof entree === 'string' ? entree : (entree?.types ?? entree?.default);
  if (!declare) return null;
  const relatif = declare
    .replace(/^\.\//, '')
    .replace(/^dist\//, '')
    .replace(/\.d\.ts$/, '.ts')
    .replace(/\.js$/, '.ts');
  const chemin = join(srcPaquet, relatif);
  if (!existsSync(chemin)) return null;
  if (basename(chemin) === 'index.ts') {
    const dossier = dirname(chemin);
    // Garde-fou : un `index.ts` posé À LA RACINE de `src/` désignerait tout le
    // paquet. On ne recopie alors que le fichier.
    if (relative(srcPaquet, dossier) !== '') {
      return { chemin: dossier, relatif: relative(srcPaquet, dossier), estDossier: true };
    }
  }
  return { chemin, relatif, estDossier: false };
}

function lireManifeste() {
  if (!existsSync(MANIFESTE)) return null;
  return JSON.parse(readFileSync(MANIFESTE, 'utf8'));
}

function fichiersTs(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fichiersTs(p));
    else if (e.endsWith('.ts')) out.push(p);
  }
  return out;
}

const empreinte = (contenu) =>
  createHash('sha256').update(contenu).digest('hex').slice(0, 16);

function empreintesActuelles() {
  if (!existsSync(CIBLE)) return {};
  const out = {};
  for (const f of fichiersTs(CIBLE)) {
    out[relative(CIBLE, f).split('\\').join('/')] = empreinte(readFileSync(f));
  }
  return out;
}

// ── mode contrôle (défaut) ───────────────────────────────────────────────
function controler(manifeste) {
  if (!existsSync(EMPREINTES)) {
    if (!manifeste || (manifeste.sousChemins ?? []).length === 0) {
      console.log('socle — aucun sous-chemin vendorisé, rien à contrôler.');
      return 0;
    }
    console.error(
      `socle — ${MANIFESTE} déclare ${manifeste.sousChemins.length} sous-chemin(s)` +
        ` mais ${EMPREINTES} est absent.\n  Lancer : npm run socle:sync`,
    );
    return 1;
  }
  const attendu = JSON.parse(readFileSync(EMPREINTES, 'utf8'));
  const actuel = empreintesActuelles();
  const noms = new Set([...Object.keys(attendu.fichiers ?? {}), ...Object.keys(actuel)]);
  const ecarts = [];
  for (const n of [...noms].sort()) {
    const a = attendu.fichiers?.[n];
    const b = actuel[n];
    if (a === b) continue;
    if (!a) ecarts.push(`  + ${n} — présent, non déclaré (ajout à la main ?)`);
    else if (!b) ecarts.push(`  - ${n} — déclaré, absent du dépôt`);
    else ecarts.push(`  ~ ${n} — MODIFIÉ (${a} → ${b})`);
  }
  if (ecarts.length > 0) {
    console.error(
      `socle — l'arbre vendorisé ne correspond plus à ${EMPREINTES} :\n` +
        ecarts.join('\n') +
        '\n\n  Ce code est GÉNÉRÉ. Corriger dans le socle, publier, puis' +
        ' `npm run socle:sync`.\n  Pour écraser une édition locale sans rien' +
        ' corriger en amont : `npm run socle:sync`.',
    );
    return 1;
  }
  // 🔴 L'arbre peut être intact et pourtant NE PAS COMPILER : il suffit qu'une
  // entrée de carte d'imports manque (B23). Le contrôle est ici, avant
  // `check:edge`, parce qu'il nomme la ligne exacte à coller là où `deno check`
  // ne rend qu'un message qui accuse le paquet. Il reste HORS LIGNE et SANS
  // JETON : les entrées attendues ont été figées dans EMPREINTES.json à la
  // synchronisation, il n'y a donc rien à réinstaller pour les connaître.
  // `??` et non `||` : un socle sans aucun spécificateur nu déclare `{}`, et
  // c'est une réponse, pas une absence. Une empreinte d'avant B23 n'a pas le
  // champ — le contrôle est alors sauté, et la prochaine synchro le pose.
  const diagnostic = diagnosticCarte(attendu.importsRequis);
  if (diagnostic) {
    console.error(diagnostic);
    return 1;
  }

  console.log(
    `socle — ${Object.keys(actuel).length} fichiers vendorisés, intacts ` +
      `(${PAQUET}@${attendu.version}).`,
  );
  return 0;
}

// ── mode synchronisation ─────────────────────────────────────────────────
function synchroniser(manifeste) {
  if (!manifeste) {
    console.error(`socle — ${MANIFESTE} absent. Rien à vendoriser.`);
    return 1;
  }
  const { version, sousChemins = [] } = manifeste;
  if (!version) {
    console.error(`socle — ${MANIFESTE} : champ \`version\` obligatoire.`);
    return 1;
  }
  const racinePaquet = join('node_modules', ...PAQUET.split('/'));
  const srcPaquet = join(racinePaquet, 'src');
  if (!existsSync(srcPaquet)) {
    console.error(
      `socle — ${srcPaquet} absent.\n` +
        `  Installer d'abord le paquet, ce qui demande un jeton read:packages :\n` +
        `    export GITHUB_PACKAGES_TOKEN=…\n    npm i -D ${PAQUET}@${version}\n` +
        '  ⚠️ Ce jeton ne sert QU\'ICI. La construction ne le demande plus.',
    );
    return 1;
  }
  // 🔴 La version installée doit être CELLE du manifeste. Sans ce contrôle, une
  // synchro faite avec une autre version poserait du code qui ne correspond à
  // rien de ce que le dépôt déclare.
  // Lu une seule fois : sert au contrôle de version, à la résolution des
  // sous-chemins par la carte `exports`, et au calcul des entrées `npm:`.
  const pjPaquet = JSON.parse(
    readFileSync(join(racinePaquet, 'package.json'), 'utf8'),
  );
  const installee = pjPaquet.version;
  if (installee !== version) {
    console.error(
      `socle — ${MANIFESTE} déclare ${version}, le paquet installé est ` +
        `${installee}. Aligner l'un ou l'autre avant de synchroniser.`,
    );
    return 1;
  }

  rmSync(CIBLE, { recursive: true, force: true });
  const fichiers = {};
  for (const sc of sousChemins) {
    const source = resoudreSource(pjPaquet, srcPaquet, sc);
    if (!source) {
      const connus = Object.keys(pjPaquet.exports ?? {})
        .map((c) => c.replace(/^\.\//, ''))
        .sort();
      console.error(
        `socle — sous-chemin absent de la carte \`exports\` de ${PAQUET}@${installee} : ${sc}\n` +
          `  Sous-chemins publiés :\n${connus.map((c) => `    · ${c}`).join('\n')}`,
      );
      return 1;
    }
    // ⭐ LA DESTINATION CALQUE `src/`, ELLE NE REPREND PAS LE NOM DU
    // SOUS-CHEMIN. `edge/mint-jwt` atterrit donc en `edge/mintJwt.ts`. Ce n'est
    // pas cosmétique : les fichiers du socle s'importent entre eux par leur
    // nom de FICHIER, et renommer la copie casserait ces imports relatifs.
    const dest = join(CIBLE, source.relatif);
    mkdirSync(source.estDossier ? dest : dirname(dest), { recursive: true });
    cpSync(source.chemin, dest, { recursive: source.estDossier });
  }
  // Bandeau ET réécriture d'extensions posés APRÈS la copie : l'empreinte porte
  // donc sur le fichier tel qu'il est réellement dans le dépôt.
  // Les spécificateurs nus sont relevés SUR LE CONTENU FINAL, après réécriture
  // des extensions : c'est exactement ce que Deno lira.
  const nus = new Set();
  for (const f of fichiersTs(CIBLE)) {
    const rel = relative(CIBLE, f).split('\\').join('/');
    const contenu =
      BANDEAU(rel, version) + reecrireExtensions(readFileSync(f, 'utf8'));
    writeFileSync(f, contenu);
    fichiers[rel] = empreinte(contenu);
    for (const spec of specificateursNus(contenu)) nus.add(spec);
  }
  const importsRequis = Object.fromEntries(
    [...nus].sort().map((spec) => [spec, entreeNpm(pjPaquet, spec)]),
  );
  writeFileSync(
    EMPREINTES,
    JSON.stringify(
      {
        '//': 'GÉNÉRÉ par scripts/vendorer-socle.mjs. Empreintes sha256 (16 car.)'
          + " de l'arbre vendorisé. `npm run verify` échoue si elles ne"
          + ' correspondent plus — protection contre une édition locale, SANS'
          + ' réseau ni jeton.',
        paquet: PAQUET,
        version,
        sousChemins,
        genereLe: new Date().toISOString().slice(0, 10),
        '//importsRequis': "Spécificateurs NUS importés par l'arbre vendorisé,"
          + " relevés à la synchronisation, avec l'entrée de carte d'imports que"
          + ' chacun exige. Figés ici pour que le contrôle hors ligne puisse les'
          + " réclamer SANS réinstaller le paquet — donc sans jeton. Hors de"
          + ' `node_modules`, Deno n\'en résout aucun tout seul, `import type`'
          + ' compris. Voir APP-TEMPLATE B23.',
        importsRequis,
        fichiers,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `socle — ${Object.keys(fichiers).length} fichiers vendorisés depuis ` +
      `${PAQUET}@${version} vers ${CIBLE}/`,
  );

  // ⭐ CE QUI SUIT REMPLACE UN RAPPEL GÉNÉRIQUE (B23). L'ancien texte listait
  // `jose` et `@supabase/supabase-js` quoi qu'on vendorise, sans dire dans quel
  // fichier écrire quoi. Il disait la bonne chose au mauvais moment.
  const specs = Object.keys(importsRequis);
  if (specs.length === 0) {
    console.log('  Aucun spécificateur nu : rien à ajouter à la carte d\'imports.');
  } else {
    console.log(
      `  Spécificateurs nus du code vendorisé (${specs.length}) : ${specs.join(', ')}`,
    );
    const diagnostic = diagnosticCarte(importsRequis);
    if (diagnostic) {
      console.log('');
      console.log(diagnostic);
    } else {
      const cartes = cartesDuDepot();
      console.log(
        `  ✓ Tous résolus par ${cartes.length} carte(s) : ` +
          `${cartes.map((c) => c.chemin).join(', ')}.`,
      );
    }
    // Distincte de la carte, et pas au même endroit : la carte sert au code
    // Edge sous Deno, `package.json` au FRONT, qui atteint la même copie par
    // l'alias `@socle/*` et se résout, lui, par `node_modules`.
    console.log(
      `  ⚠️ Rappel : le FRONT importe la même copie via \`@socle/*\`. Un ` +
        `spécificateur nu qu'il traverse doit AUSSI être dans les dépendances ` +
        `npm du projet — la carte d'imports ne vaut que pour Deno.`,
    );
  }

  // 🔴 LE DERNIER GESTE, ET CELUI QU'ON OUBLIE. Le squelette ne le disait
  // nulle part jusqu'au 2026-09-10 ; APP-FACTU l'avait ajouté chez lui. Laisser
  // le paquet en devDependency le fait réinstaller à CHAQUE `npm ci` — donc
  // redemander le jeton dans l'image Docker du front, exactement ce que le
  // vendoring supprime. Dit ICI plutôt que dans un document seul, parce que
  // c'est ici qu'on se trouve au moment où le geste est dû.
  avertirTsconfig();

  console.log(
    `\n  ➡️ DERNIER GESTE, à faire maintenant :  npm uninstall ${PAQUET}\n` +
      `     Le garder en devDependency ferait redemander le jeton à chaque ` +
      `\`npm ci\`.\n     Le code vendorisé, lui, reste : c'est tout l'objet ` +
      `de la manœuvre.`,
  );
  return 0;
}

// ── mode comparaison amont (mainteneur) ──────────────────────────────────
function comparerAmont(manifeste) {
  if (!manifeste) {
    console.error(`socle — ${MANIFESTE} absent.`);
    return 1;
  }
  const res = spawnSync('npm', ['view', `${PAQUET}`, 'version'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(
      'socle — impossible d\'interroger le registre. Ce mode DEMANDE un jeton :\n' +
        '    export GITHUB_PACKAGES_TOKEN=…\n' +
        "  C'est voulu : le contrôle d'intégrité de `verify`, lui, n'en demande pas.",
    );
    return 1;
  }
  const amont = res.stdout.trim();
  if (amont === manifeste.version) {
    console.log(`socle — à jour : ${manifeste.version} est la dernière version.`);
    return 0;
  }
  console.log(
    `socle — une version plus récente existe : ${amont} (le dépôt est en ` +
      `${manifeste.version}).\n  Monter \`version\` dans ${MANIFESTE}, ` +
      `\`npm i -D ${PAQUET}@${amont}\`, puis \`npm run socle:sync\`.`,
  );
  return 0;
}

// ── Point d'entrée, et pourquoi il est gardé ─────────────────────────
//
// 🔴 SANS CETTE GARDE, CE FICHIER N'EST PAS TESTABLE. Il se terminait par un
// `process.exit()` au niveau module : l'importer suffisait à le faire tourner
// puis quitter le processus. Or ce script vit dans `template/**`, que la porte
// ne garde PAS (BACKLOG B10) — et c'est de lui que sont sortis les quatre
// trous du vendoring ET un contrôle qui ne pouvait jamais se déclencher.
//
// La garde ne déplace pas le code : le script doit rester AUTONOME chez un
// consommateur, sans dépendance ni jeton. Elle le rend seulement importable,
// pour que ses fonctions PURES soient éprouvées depuis `packages/`, la zone
// que la porte garde. Voir `packages/boilerplate-kit/tests/vendoringOutillage.test.ts`.
//
// `realpathSync` des deux côtés : sur un dépôt atteint par un lien symbolique,
// une comparaison de chaînes brutes échouerait et le CLI ne se lancerait pas.
const lanceDirectement = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (lanceDirectement) {
  const manifeste = lireManifeste();
  const mode = process.argv[2] ?? '';
  const code =
    mode === '--synchroniser' ? synchroniser(manifeste)
    : mode === '--comparer-amont' ? comparerAmont(manifeste)
    : controler(manifeste);
  process.exit(code);
}

// Exportées POUR ÊTRE ÉPROUVÉES, pas pour être réutilisées : ce sont les
// fonctions pures du script, celles dont un défaut est silencieux.
export {
  reecrireExtensions,
  specificateursNus,
  nomPaquet,
  entreeNpm,
  carteResout,
  resoudreSource,
  lireJsonc,
};
