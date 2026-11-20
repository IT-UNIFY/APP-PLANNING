// Pages du lot 1 — ENVELOPPES seulement : titre, fil d'Ariane et menu des
// paramètres, avec les libellés de la maquette. Le contenu (calendrier,
// liste, import) arrive avec les données (ADR-001 ; écrans `L1-*.dc.html`).
import type { ReactNode } from 'react';
import { MenuParametres } from '@it-unify/ui-epss/coque';
import { EnTetePage } from '@it-unify/ui-epss/composants';
import { GROUPES_PARAMETRES, ROUTES } from '../navigation';

export function PageInterventions() {
  return (
    <EnTetePage
      ariane={[{ libelle: 'Plannings' }, { libelle: 'Interventions' }]}
      titre="Interventions"
      sousTitre="Toutes les interventions importées d’Aurion, en lecture seule."
    />
  );
}

function PageParametres(props: { groupe: string; titre: string; sousTitre: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <MenuParametres
        groupes={GROUPES_PARAMETRES}
        lienTitre={ROUTES.acces}
        note="Lot 1 : seules ces rubriques existent. Les autres arrivent au lot 2, dans ces mêmes groupes."
      />
      <div className="min-w-0 flex-[999_1_480px]">
        <EnTetePage
          ariane={[{ libelle: 'Paramètres', to: ROUTES.acces }, { libelle: props.groupe }, { libelle: props.titre }]}
          titre={props.titre}
          sousTitre={props.sousTitre}
        />
        {props.children}
      </div>
    </div>
  );
}

export function PageAcces() {
  return (
    <PageParametres
      groupe="Personnes et accès"
      titre="Utilisateurs et accès"
      sousTitre="Accès gérés dans le Planning ; ajout de personnes depuis Microsoft 365."
    />
  );
}

export function PageImport() {
  return (
    <PageParametres
      groupe="Technique"
      titre="Import Aurion"
      sousTitre="Le Planning reçoit les séances d’Aurion. Rien ne repart vers Aurion."
    />
  );
}

export function PageIntrouvable() {
  return (
    <EnTetePage
      titre="Page introuvable"
      sousTitre="Cette adresse ne correspond à aucun écran du Planning."
    />
  );
}
