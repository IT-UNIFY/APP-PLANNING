import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@it-unify/ui-epss/coque';
import { GROUPES_MENU, PICTO_PLANNING, ROUTES } from './navigation';
import { PageAcces, PageImport, PageInterventions, PageIntrouvable } from './pages/pages';

// Le routage est déclaré ICI, avec `react-router-dom`. Les URL doivent rester
// partageables et ajoutables aux favoris : ne pas remplacer le routeur par un
// state machine `activeView` — c'est une régression qui a déjà été payée
// ailleurs dans le parc.
//
// Les gardes d'accès (`RequireAuth`, `RequireRole`) se déclarent à ce niveau,
// pas dans les composants de page.
//
// La coque (bandeau, menu, panneau mobile) vient de `@it-unify/ui-epss` :
// la corriger ici serait perdu à la prochaine synchronisation. Un correctif
// se fait dans IT-UNIFY/TEMPLATE-EPSS.
//
// ⚠️ Pas encore de connexion : `utilisateur` et `onDeconnexion` seront
// branchés avec m365-auth (docs/BACKLOG.md).

export default function App() {
  return (
    <AppShell
      module={{ nom: 'Planning', sousTitre: 'ERP EPSS', pictogramme: PICTO_PLANNING }}
      groupes={GROUPES_MENU}
      cleMenuReplie="planning.menu.replie"
      // Carnet et maquette : menu replié sur les icônes par défaut, le choix
      // de le garder déplié est mémorisé.
      menuReplieParDefaut
    >
      <Routes>
        <Route path="/" element={<Navigate to={ROUTES.interventions} replace />} />
        <Route path={ROUTES.interventions} element={<PageInterventions />} />
        <Route path={ROUTES.parametres} element={<Navigate to={ROUTES.acces} replace />} />
        <Route path={ROUTES.acces} element={<PageAcces />} />
        <Route path={ROUTES.import} element={<PageImport />} />
        <Route path="*" element={<PageIntrouvable />} />
      </Routes>
    </AppShell>
  );
}
