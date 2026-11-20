// Vendoring de la charte ERP EPSS (`@it-unify/ui-epss`) — copie contrôlée,
// et AUCUN jeton, ni au build ni à l'installation.
//
// ⭐ POURQUOI (décision du 2026-11-20, même raisonnement que le socle,
// APP-TEMPLATE ADR-001 D16). Installer le paquet depuis GitHub Packages
// demanderait un jeton `read:packages` partout où l'on construit, image Docker
// comprise (`npm ci` du Dockerfile). Ici, le paquet CONSTRUIT est copié dans
// `vendor/ui-epss/`, versionné, et déclaré en dépendance `file:` : npm le
// relie dans `node_modules` comme n'importe quel paquet, et la carte
// `exports` (`/coque`, `/composants`, `/tokens.css`, `/theme.css`…) marche
// telle quelle.
//
// ⚠️ CE QUI EST COPIÉ : exactement les fichiers que le paquet publierait
// (`files` de son `package.json`, après `npm run build`), plus un
// `package.json` réduit (nom, version, `exports`, `peerDependencies` — ni
// scripts ni dépendances de développement). React et le routeur viennent du
// projet : `vendor/` est DANS le projet, donc la résolution remonte jusqu'à
// son `node_modules`.
//
// ⭐ DEUX MODES.
//
//   node scripts/vendorer-ui-epss.mjs
//     VÉRIFIER, hors ligne (dans `npm run verify`) : chaque fichier de
//     `vendor/ui-epss/` a l'empreinte notée dans `EMPREINTES.json`, aucun
//     n'en manque, aucun n'est en trop, et `package.json` déclare bien la
//     dépendance `file:`. Une retouche locale est refusée : un correctif se
//     fait dans TEMPLATE-EPSS, puis se resynchronise.
//
//   node scripts/vendorer-ui-epss.mjs --synchroniser --depuis <clone> --ref <ref>
//     SYNCHRONISER, sur un poste qui a un clone de IT-UNIFY/TEMPLATE-EPSS :
//     extrait `<ref>` (étiquette, branche ou commit) par `git archive` — donc
//     sans toucher à l'arbre de travail du clone —, l'installe (`npm ci`), le
//     construit, puis remplace `vendor/ui-epss/`. Réseau requis (npm), jeton
//     non.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const RACINE = process.cwd();
const CIBLE = join(RACINE, 'vendor', 'ui-epss');
const EMPREINTES = join(CIBLE, 'EMPREINTES.json');
const NOM = '@it-unify/ui-epss';
const DEPENDANCE = 'file:vendor/ui-epss';

function echouer(message) {
  console.error(`ui-epss — ${message}`);
  process.exit(1);
}

function argument(nom) {
  const i = process.argv.indexOf(nom);
  return i === -1 ? undefined : process.argv[i + 1];
}

function sha256(chemin) {
  return createHash('sha256').update(readFileSync(chemin)).digest('hex');
}

function lister(dossier) {
  const fichiers = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) fichiers.push(...lister(chemin));
    else fichiers.push(chemin);
  }
  return fichiers;
}

// Chemins notés en `/`, quel que soit le système : le fichier d'empreintes est
// versionné et relu sur d'autres postes.
const cle = (chemin) => relative(CIBLE, chemin).split(sep).join('/');

function verifier() {
  if (!existsSync(EMPREINTES)) {
    echouer(`${relative(RACINE, EMPREINTES)} absent. Lancer la synchronisation (voir l'en-tête du script).`);
  }
  const notees = JSON.parse(readFileSync(EMPREINTES, 'utf8'));
  const attendus = new Map(Object.entries(notees.fichiers));
  const ecarts = [];
  for (const chemin of lister(CIBLE)) {
    const c = cle(chemin);
    if (c === 'EMPREINTES.json') continue;
    if (!attendus.has(c)) ecarts.push(`en trop : ${c}`);
    else if (attendus.get(c) !== sha256(chemin)) ecarts.push(`modifié : ${c}`);
    attendus.delete(c);
  }
  for (const c of attendus.keys()) ecarts.push(`manquant : ${c}`);
  const pkg = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
  if (pkg.dependencies?.[NOM] !== DEPENDANCE) {
    ecarts.push(`package.json doit déclarer "${NOM}": "${DEPENDANCE}" dans dependencies`);
  }
  if (ecarts.length) {
    echouer(
      `la copie vendorisée ne correspond plus à ${notees.commit.slice(0, 7)} :\n  ` +
        ecarts.join('\n  ') +
        '\n  Un correctif se fait dans TEMPLATE-EPSS, puis se resynchronise.',
    );
  }
  console.log(
    `ui-epss — ${Object.keys(notees.fichiers).length} fichiers conformes à ` +
      `${notees.version} (${notees.ref}, ${notees.commit.slice(0, 7)}).`,
  );
}

function synchroniser() {
  const depuis = argument('--depuis');
  const ref = argument('--ref');
  if (!depuis || !ref) echouer('--synchroniser demande --depuis <clone TEMPLATE-EPSS> et --ref <ref>.');
  const clone = resolve(depuis);
  const git = (...args) => execFileSync('git', ['-C', clone, ...args], { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', '--verify', `${ref}^{commit}`);

  const travail = mkdtempSync(join(tmpdir(), 'ui-epss-'));
  try {
    const archive = join(travail, 'source.tar');
    execFileSync('git', ['-C', clone, 'archive', '--output', archive, commit]);
    const source = join(travail, 'source');
    execFileSync('mkdir', [source]);
    execFileSync('tar', ['-xf', archive, '-C', source]);
    // Le `.npmrc` du paquet lit un jeton par variable : inutile ici (aucune
    // dépendance @it-unify), et gênant s'il manque. On l'écarte.
    rmSync(join(source, '.npmrc'), { force: true });
    execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: source, stdio: 'inherit' });
    execFileSync('npm', ['run', 'build'], { cwd: source, stdio: 'inherit' });

    const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    if (pkg.name !== NOM) echouer(`${clone} porte ${pkg.name}, pas ${NOM}.`);

    rmSync(CIBLE, { recursive: true, force: true });
    for (const entree of pkg.files) {
      const de = join(source, entree);
      if (!existsSync(de)) echouer(`« ${entree} » (files) absent après le build.`);
      cpSync(de, join(CIBLE, entree), { recursive: true });
    }
    const reduit = {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      type: pkg.type,
      license: pkg.license,
      exports: pkg.exports,
      peerDependencies: pkg.peerDependencies,
    };
    writeFileSync(join(CIBLE, 'package.json'), JSON.stringify(reduit, null, 2) + '\n');

    const fichiers = Object.fromEntries(
      lister(CIBLE)
        .map((f) => [cle(f), sha256(f)])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    const notees = {
      '//': 'Généré par scripts/vendorer-ui-epss.mjs. Ne pas éditer : npm run verify compare chaque fichier à son empreinte.',
      source: 'IT-UNIFY/TEMPLATE-EPSS',
      ref,
      commit,
      version: pkg.version,
      fichiers,
    };
    writeFileSync(EMPREINTES, JSON.stringify(notees, null, 2) + '\n');
    console.log(
      `ui-epss — ${Object.keys(fichiers).length} fichiers vendorisés depuis ${ref} ` +
        `(${commit.slice(0, 7)}, version ${pkg.version}) vers vendor/ui-epss/.\n` +
        `  ➡️ Puis : npm install (relie la dépendance ${DEPENDANCE}), npm run verify.`,
    );
  } finally {
    rmSync(travail, { recursive: true, force: true });
  }
}

if (process.argv.includes('--synchroniser')) synchroniser();
else verifier();
