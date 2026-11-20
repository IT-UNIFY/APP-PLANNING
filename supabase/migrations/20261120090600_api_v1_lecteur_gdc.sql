-- =====================================================================
-- 20261120090600_api_v1_lecteur_gdc.sql — APP-PLANNING, lot 1
--
-- Le contrat de lecture des autres modules (ADR-001 D2, D3) : le schéma
-- `api_v1`, fait de vues en lecture seule, et l'identité technique
-- `lecteur_gdc` qui le lit.
--
-- RÈGLES DU CONTRAT :
--   * Les autres modules ne lisent JAMAIS `public` directement : ils
--     lisent `api_v1`. Retirer une colonne ou changer un sens = geler
--     `api_v1` et ouvrir `api_v2`. Ajouter une colonne ne demande pas de
--     nouvelle version.
--   * Chaque vue porte un `comment on view` : son sens et ses clés.
--   * AUCUN NOM DE PERSONNE dans `api_v1` : la personne appartient à
--     l'outil Intervenant, qui l'a déjà. L'intervenant n'y apparaît que
--     par `aurion_individu_id`.
--
-- COMMENT LA LECTURE EST BORNÉE (Q7) :
--   * vues `security_invoker = true` : elles s'exécutent avec les droits
--     du LECTEUR, donc la RLS des tables sources s'applique à lui. Une vue
--     ordinaire (definer) s'exécuterait avec les droits de son
--     propriétaire (`postgres`) et contournerait toute la RLS ;
--   * `lecteur_gdc` reçoit `select` COLONNE PAR COLONNE sur les tables
--     sources, et seulement les colonnes que les vues lisent. Une colonne
--     ajoutée plus tard à une table n'est pas lisible par défaut ;
--   * une politique `to lecteur_gdc using (true)` par table source : il
--     lit tout le Planning (le filtre par intervenant est fait par
--     l'appelant, l'Edge Function du Planning qui le sert — Q8, hors lot).
--
-- CE QUE `lecteur_gdc` N'EST PAS : la `service_role` du Planning (ADR-001
-- D3). Il ne contourne pas la RLS et n'écrit rien.
--
-- Exposer `api_v1` à PostgREST se règle sur le projet distant
-- (`api.schemas`), hors migration.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Le rôle technique.
--
--    NOLOGIN, sans mot de passe : personne ne s'y connecte directement.
--    PostgREST y bascule (`set role`) depuis `authenticator` quand un
--    jeton porte `role = lecteur_gdc` — d'où le `grant … to
--    authenticator`. Un mot de passe dans une migration serait versionné
--    pour toujours (AGENTS.md §3).
--
--    NOINHERIT : il n'hérite de rien, même si on l'ajoutait un jour par
--    erreur à un autre rôle.
--
--    ⚠️ À PROUVER EN RÉPÉTITION sur la base jetable du runner : que
--    `postgres` peut accorder ce rôle à `authenticator` sur Supabase
--    (Postgres 16+ donne l'option ADMIN au créateur d'un rôle).
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lecteur_gdc') then
    create role lecteur_gdc nologin noinherit;
  end if;
end;
$$;

comment on role lecteur_gdc is
  'Identité technique de l''outil Intervenant (GDC) : lecture seule de '
  'api_v1, sans service_role (ADR-001 D3). NOLOGIN, servi par PostgREST.';

grant lecteur_gdc to authenticator;

-- Le rôle doit traverser `public` pour que les vues `security_invoker`
-- atteignent leurs tables sources. `usage` sur un schéma ne donne accès à
-- AUCUNE table : seuls les `select` par colonne ci-dessous le font.
grant usage on schema public to lecteur_gdc;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Le schéma.
-- ─────────────────────────────────────────────────────────────────────
create schema if not exists api_v1;

comment on schema api_v1 is
  'Contrat de lecture du Planning pour les autres modules (ADR-001 D2). '
  'Vues en lecture seule, security_invoker. Version 1 : une colonne retirée '
  'ou un sens changé ouvre api_v2.';

revoke all on schema api_v1 from public;
revoke all on schema api_v1 from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Les vues.
-- ─────────────────────────────────────────────────────────────────────

create or replace view api_v1.interventions
with (security_invoker = true) as
select
  i.id,
  i.aurion_seance_id,
  i.debut,
  i.fin,
  i.cours_code,
  i.cours_intitule,
  i.type_activite,
  i.modalite,
  i.salle_id,
  coalesce(s.nom, i.salle_nom_aurion) as salle_nom,
  s.site as salle_site,
  i.etat_aurion,
  i.statut,
  i.retiree_le,
  i.aurion_maj_le,
  i.updated_at
from public.interventions i
left join public.salles s on s.id = i.salle_id;

comment on view api_v1.interventions is
  'Séances du Planning. Clé : id (UUID stable, ne change jamais). Ancien '
  'code : aurion_seance_id. statut = active | retiree ; une séance retirée '
  'reste, avec retiree_le. salle_nom = salle reconnue, sinon nom brut '
  'd''Aurion. updated_at ne bouge que sur un vrai changement.';

create or replace view api_v1.intervention_groupes
with (security_invoker = true) as
select
  ig.intervention_id,
  ig.groupe_id,
  g.aurion_code as groupe_aurion_code,
  g.intitule as groupe_intitule,
  g.nature as groupe_nature
from public.intervention_groupes ig
join public.promotions_groupes g on g.id = ig.groupe_id;

comment on view api_v1.intervention_groupes is
  'Liaison n-n séance ↔ promotion ou groupe, telle que dans Aurion. Clé : '
  '(intervention_id, groupe_id). groupe_nature peut être NULL.';

create or replace view api_v1.affectations
with (security_invoker = true) as
select
  a.id,
  a.intervention_id,
  a.aurion_individu_id,
  a.aurion_intervention_id,
  a.role,
  a.statut,
  a.statut_aurion,
  a.statut_depuis,
  a.remplacee_par,
  a.updated_at
from public.affectations a;

comment on view api_v1.affectations is
  'Une ligne par intervenant et par séance. Clé : id (UUID stable, auquel '
  'le lecteur rattache contrat et paie). Personne : aurion_individu_id. '
  'statut = prevu | ajoute | annule | remplace | retire, daté par '
  'statut_depuis ; statut_aurion = texte brut d''Aurion. remplacee_par reste '
  'NULL tant qu''Aurion ne donne pas le lien. Aucun nom de personne.';

create or replace view api_v1.affectations_intervenant
with (security_invoker = true) as
select
  a.id as affectation_id,
  a.aurion_individu_id,
  a.role,
  a.statut,
  a.statut_aurion,
  a.statut_depuis,
  a.remplacee_par,
  a.updated_at as affectation_updated_at,
  i.id as intervention_id,
  i.debut,
  i.fin,
  i.cours_code,
  i.cours_intitule,
  i.type_activite,
  i.modalite,
  coalesce(s.nom, i.salle_nom_aurion) as salle_nom,
  s.site as salle_site,
  i.statut as intervention_statut,
  i.retiree_le as intervention_retiree_le,
  i.aurion_maj_le,
  i.updated_at as intervention_updated_at,
  coalesce((
    select jsonb_agg(
             jsonb_build_object('id', g.id, 'aurion_code', g.aurion_code, 'intitule', g.intitule)
             order by g.aurion_code)
      from public.intervention_groupes ig
      join public.promotions_groupes g on g.id = ig.groupe_id
     where ig.intervention_id = i.id
  ), '[]'::jsonb) as groupes
from public.affectations a
join public.interventions i on i.id = a.intervention_id
left join public.salles s on s.id = i.salle_id;

comment on view api_v1.affectations_intervenant is
  'Affectation et sa séance, à plat, pour « Mon planning » et les contrats. '
  'Clé : affectation_id. LE FILTRE PAR aurion_individu_id EST À LA CHARGE DE '
  'L''APPELANT, qui le tire de l''identité vérifiée de l''intervenant, '
  'jamais d''un paramètre du navigateur (ADR-001 D4). groupes = tableau JSON '
  '{id, aurion_code, intitule}.';

-- Flux de mise à jour par étapes (ADR-001 D5). Retraits compris : rien ne
-- s'efface, un retrait est un changement de statut.
create or replace view api_v1.changements
with (security_invoker = true) as
select 'intervention'::text as entite, i.id, i.id as intervention_id, i.statut, i.updated_at
  from public.interventions i
union all
select 'affectation'::text as entite, a.id, a.intervention_id, a.statut, a.updated_at
  from public.affectations a;

comment on view api_v1.changements is
  'Flux des changements d''interventions et d''affectations, retraits '
  'compris. Pagination par (updated_at, id) croissants : reprendre après le '
  'dernier couple lu. ATTENTION : updated_at est l''heure de TRANSACTION du '
  'Planning ; une ligne écrite par un import long devient visible à la fin '
  'de l''import avec une heure antérieure. Le lecteur relit donc avec une '
  'marge (reprendre à son curseur moins la durée maximale d''un import), et '
  'traite chaque ligne de façon idempotente.';

-- État d'une affectation à une date J (ADR-001 D6) :
--   where affectation_id = X and valide_depuis <= J
--     and (valide_jusqua is null or valide_jusqua > J)
create or replace view api_v1.affectations_historique
with (security_invoker = true) as
select
  h.id as version_id,
  h.affectation_id,
  h.valide_depuis,
  lead(h.valide_depuis) over (
    partition by h.affectation_id order by h.valide_depuis, h.id
  ) as valide_jusqua,
  h.operation,
  h.import_id,
  h.intervention_id,
  h.aurion_individu_id,
  h.aurion_intervention_id,
  h.role,
  h.statut,
  h.statut_aurion,
  h.statut_depuis,
  h.remplacee_par
from public.affectations_historique h;

comment on view api_v1.affectations_historique is
  'États successifs d''une affectation. Clé : version_id. Une version vaut '
  'de valide_depuis (inclus) à valide_jusqua (exclu, NULL = encore en '
  'vigueur). État au jour J : valide_depuis <= J and (valide_jusqua is null '
  'or valide_jusqua > J). Dates = heure de transaction du Planning ; '
  'plusieurs versions d''une même transaction ont la même date, la dernière '
  'fait foi.';

-- État d'une séance à une date J (ADR-001 D6 : « date, horaires » font
-- partie de la preuve). Même modèle que la vue précédente. Une DPAE ou un
-- contrat se justifie par l'affectation ET par la séance telles qu'elles
-- étaient le jour J : les horaires vivent ici, pas sur l'affectation.
--
-- La salle : `salle_id` et `salle_nom_aurion` sont ceux de la VERSION.
-- `salle_nom` lit le nom ACTUEL de la salle reconnue (la table `salles`
-- n'a pas d'historique au lot 1) ; pour la preuve, `salle_id` fait foi.
create or replace view api_v1.interventions_historique
with (security_invoker = true) as
select
  h.id as version_id,
  h.intervention_id,
  h.valide_depuis,
  lead(h.valide_depuis) over (
    partition by h.intervention_id order by h.valide_depuis, h.id
  ) as valide_jusqua,
  h.operation,
  h.import_id,
  h.debut,
  h.fin,
  h.cours_code,
  h.cours_intitule,
  h.type_activite,
  h.modalite,
  h.salle_id,
  h.salle_nom_aurion,
  coalesce(s.nom, h.salle_nom_aurion) as salle_nom,
  h.statut,
  h.retiree_le
from public.interventions_historique h
left join public.salles s on s.id = h.salle_id;

comment on view api_v1.interventions_historique is
  'États successifs d''une séance (horaires, cours, salle, statut). Clé : '
  'version_id. Une version vaut de valide_depuis (inclus) à valide_jusqua '
  '(exclu, NULL = encore en vigueur). État au jour J : valide_depuis <= J '
  'and (valide_jusqua is null or valide_jusqua > J). Dates = heure de '
  'transaction du Planning ; plusieurs versions d''une même transaction ont '
  'la même date, la dernière fait foi. salle_id et salle_nom_aurion sont '
  'ceux de la version ; salle_nom est le nom ACTUEL de la salle reconnue.';

create or replace view api_v1.dernier_import
with (security_invoker = true) as
select ia.id, ia.debut, ia.fin, ia.statut
  from public.imports_aurion ia
 where ia.statut in ('reussi', 'reussi_avec_anomalies')
 order by ia.debut desc, ia.id desc
 limit 1;

comment on view api_v1.dernier_import is
  'Dernier import Aurion RÉUSSI (avec ou sans anomalies) : la fraîcheur des '
  'données lues (« date du dernier import » de Mon planning). Zéro ou une '
  'ligne. Un import en échec ne change pas cette date.';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Droits sur api_v1 : lecteur_gdc seul.
--    Les vues sont créées par `postgres` ; on retire nommément tout droit
--    qu'un privilège par défaut aurait pu poser.
-- ─────────────────────────────────────────────────────────────────────
revoke all on all tables in schema api_v1 from public;
revoke all on all tables in schema api_v1 from anon, authenticated;
grant usage on schema api_v1 to lecteur_gdc;
grant select on all tables in schema api_v1 to lecteur_gdc;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Droits par colonne sur les tables sources — exactement les colonnes
--    que les vues lisent. `intervenants_aurion`, `anomalies_import`,
--    `profiles`, `user_roles`, `audit_log` et `m365_tenants` ne reçoivent
--    RIEN. `interventions_historique` ne reçoit que les colonnes de la
--    preuve : ni `aurion_seance_id`, ni `etat_aurion`, ni `aurion_maj_le`.
-- ─────────────────────────────────────────────────────────────────────
grant select (id, aurion_seance_id, debut, fin, cours_code, cours_intitule,
              type_activite, modalite, salle_id, salle_nom_aurion, etat_aurion,
              statut, retiree_le, aurion_maj_le, updated_at)
  on public.interventions to lecteur_gdc;

grant select (id, nom, site) on public.salles to lecteur_gdc;

grant select (intervention_id, groupe_id) on public.intervention_groupes to lecteur_gdc;

grant select (id, aurion_code, intitule, nature) on public.promotions_groupes to lecteur_gdc;

grant select (id, intervention_id, aurion_individu_id, aurion_intervention_id,
              role, statut, statut_aurion, statut_depuis, remplacee_par, updated_at)
  on public.affectations to lecteur_gdc;

grant select (id, affectation_id, valide_depuis, operation, import_id,
              intervention_id, aurion_individu_id, aurion_intervention_id,
              role, statut, statut_aurion, statut_depuis, remplacee_par)
  on public.affectations_historique to lecteur_gdc;

grant select (id, intervention_id, valide_depuis, operation, import_id,
              debut, fin, cours_code, cours_intitule, type_activite, modalite,
              salle_id, salle_nom_aurion, statut, retiree_le)
  on public.interventions_historique to lecteur_gdc;

grant select (id, debut, fin, statut) on public.imports_aurion to lecteur_gdc;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Politiques RLS pour lecteur_gdc : tout le Planning, en lecture.
--    Le filtre par intervenant n'est pas en base : l'appelant (Edge
--    Function du Planning, Q8) le pose depuis l'identité vérifiée.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists interventions_select_lecteur_gdc on public.interventions;
create policy interventions_select_lecteur_gdc
  on public.interventions for select to lecteur_gdc using (true);

drop policy if exists salles_select_lecteur_gdc on public.salles;
create policy salles_select_lecteur_gdc
  on public.salles for select to lecteur_gdc using (true);

drop policy if exists intervention_groupes_select_lecteur_gdc on public.intervention_groupes;
create policy intervention_groupes_select_lecteur_gdc
  on public.intervention_groupes for select to lecteur_gdc using (true);

drop policy if exists promotions_groupes_select_lecteur_gdc on public.promotions_groupes;
create policy promotions_groupes_select_lecteur_gdc
  on public.promotions_groupes for select to lecteur_gdc using (true);

drop policy if exists affectations_select_lecteur_gdc on public.affectations;
create policy affectations_select_lecteur_gdc
  on public.affectations for select to lecteur_gdc using (true);

drop policy if exists affectations_historique_select_lecteur_gdc on public.affectations_historique;
create policy affectations_historique_select_lecteur_gdc
  on public.affectations_historique for select to lecteur_gdc using (true);

drop policy if exists interventions_historique_select_lecteur_gdc on public.interventions_historique;
create policy interventions_historique_select_lecteur_gdc
  on public.interventions_historique for select to lecteur_gdc using (true);

drop policy if exists imports_aurion_select_lecteur_gdc on public.imports_aurion;
create policy imports_aurion_select_lecteur_gdc
  on public.imports_aurion for select to lecteur_gdc using (true);
