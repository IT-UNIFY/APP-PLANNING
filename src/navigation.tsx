// Navigation du lot 1, telle que la fixe le carnet de conception (« Menu du
// lot 1 ») et la maquette (`Menu.dc.html`, mode « lot1 »).
//
// - Menu principal : Interventions ; Paramètres (administrateur).
// - « Mon planning » n'est PAS ici : c'est un écran fourni par le Planning et
//   affiché dans l'espace intervenant de l'outil Intervenant (ADR-001, D4).
// - Paramètres : second menu à droite, groupes « Personnes et accès » et
//   « Technique ». « Historique des actions » relève du lot 2.
//
// ⚠️ Les droits ne sont pas encore branchés (m365-auth et rôles : voir
// docs/BACKLOG.md). Tant qu'ils ne le sont pas, tout le menu est visible.
import type { GroupeMenu, GroupeParametres } from '@it-unify/ui-epss/coque';
import { Icone, TRACE_PLANNING } from './components/Icone';

/** Pictogramme du module dans le logo du bandeau (tracé seul, en blanc). */
export const PICTO_PLANNING = <path d={TRACE_PLANNING} />;

export const ROUTES = {
  interventions: '/interventions',
  // Entrée du menu principal : `NavLink` la garde active sur toutes les
  // rubriques `/parametres/*` ; la route redirige vers la première rubrique.
  parametres: '/parametres',
  acces: '/parametres/acces',
  import: '/parametres/import',
} as const;

export const GROUPES_MENU: GroupeMenu[] = [
  {
    id: 'plannings',
    titre: 'Plannings',
    entrees: [{ to: ROUTES.interventions, libelle: 'Interventions', icone: <Icone nom="interv" /> }],
  },
  {
    id: 'parametres',
    titre: 'Paramètres',
    entrees: [{ to: ROUTES.parametres, libelle: 'Paramètres', icone: <Icone nom="parametres" /> }],
  },
];

export const GROUPES_PARAMETRES: GroupeParametres[] = [
  {
    id: 'personnes',
    libelle: 'Personnes et accès',
    icone: <Icone nom="personnes" taille={16} />,
    entrees: [{ to: ROUTES.acces, libelle: 'Utilisateurs et accès', motsCles: ['droits', 'rôles'] }],
  },
  {
    id: 'technique',
    libelle: 'Technique',
    icone: <Icone nom="technique" taille={16} />,
    entrees: [{ to: ROUTES.import, libelle: 'Import Aurion', motsCles: ['anomalies', 'historique'] }],
  },
];
