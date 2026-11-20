-- =====================================================================
-- 05_import.test.sql — la RPC `public.importer_seances` (ADR-002 D2).
--
-- Les imports sont appelés SOUS `service_role`, comme la future Edge
-- Function : c'est ce qui prouve que les droits accordés nommément
-- suffisent. L'identifiant de chaque import est noté dans une table
-- temporaire (`t_imp`), lue ensuite rôle rétabli.
--
-- Scénario, dans l'ordre (une seule transaction, donc une seule heure) :
--   I1 premier import · I2 réimport identique · I3 horaire modifié ·
--   I4 séance disparue · I5 séance retirée de nouveau absente (la RPC ne
--   la touche pas : ni version, ni nouvelle date, ni recomptage) ·
--   I6 affectations changées · I7 lignes invalides et séance sans
--   intervenant · I8 séances « incomplètes » (ligne invalide sur une
--   séance existante) · I9 codes Aurion d'affectation changés (Q13) ·
--   I10 doublons (séance, personne) et codes de groupe à espaces ·
--   I11 réapparition d'une séance retirée (Q9) · puis refus par l'index
--   « un seul import en cours », droits anon/authenticated.
--
-- Plage de dates (règle provisoire Q7) : I1 couvre du 07/01 au 01/03 ;
-- à partir d'I4, seules S1 et S2 sont envoyées, plage 07/01 9 h → 08/01
-- 12 h. S3 (07/01 14 h) y tombe et se retire ; S4 (01/03) n'y tombe pas
-- et reste active.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(67);

create temp table t_imp (n int primary key, id uuid);
grant all on table t_imp to public;

create temp table t_lignes (nom text primary key, lignes jsonb);
grant all on table t_lignes to public;

-- ── Lignes d'import ──────────────────────────────────────────────────
insert into t_lignes values ('base', $j$[
  {"aurion_seance_id": "S1", "aurion_intervention_id": "AUR-1",
   "debut": "2027-01-07T09:00:00+01:00", "fin": "2027-01-07T12:00:00+01:00",
   "cours_code": "DF1", "cours_intitule": "Droit de la famille", "type_activite": "Cours",
   "modalite": "Présentiel", "etat_aurion": "Planifié", "aurion_maj_le": "2026-11-01T10:00:00+01:00",
   "groupes": [{"code": "ME2028", "intitule": "ME 2028", "nature": "promotion"}],
   "salle": {"nom": "Salle 12", "site": "Site principal"},
   "intervenant": {"aurion_individu_id": "IND-1", "nom_affiche": "Intervenant Un"},
   "statut_aurion": "prévu", "role": "principal"},
  {"aurion_seance_id": "S1", "aurion_intervention_id": "AUR-2",
   "debut": "2027-01-07T09:00:00+01:00", "fin": "2027-01-07T12:00:00+01:00",
   "cours_code": "DF1", "cours_intitule": "Droit de la famille", "type_activite": "Cours",
   "modalite": "Présentiel", "etat_aurion": "Planifié", "aurion_maj_le": "2026-11-01T10:00:00+01:00",
   "groupes": [{"code": "ME2028", "intitule": "ME 2028", "nature": "promotion"}],
   "salle": {"nom": "Salle 12", "site": "Site principal"},
   "intervenant": {"aurion_individu_id": "IND-2", "nom_affiche": "Intervenant Deux"},
   "statut_aurion": "prévu", "role": "co_intervenant"},
  {"aurion_seance_id": "S2", "aurion_intervention_id": "AUR-3",
   "debut": "2027-01-08T09:00:00+01:00", "fin": "2027-01-08T12:00:00+01:00",
   "cours_intitule": "Atelier d'écriture",
   "groupes": [{"code": "ME2028", "intitule": "ME 2028"}, {"code": "EJE2029", "intitule": "EJE 2029", "nature": "groupe"}],
   "salle": {"nom": "Salle 7"},
   "intervenant": {"aurion_individu_id": "IND-1", "nom_affiche": "Intervenant Un"},
   "statut_aurion": "prévu"},
  {"aurion_seance_id": "S3", "aurion_intervention_id": "AUR-4",
   "debut": "2027-01-07T14:00:00+01:00", "fin": "2027-01-07T17:00:00+01:00",
   "cours_intitule": "Psychologie",
   "groupes": [{"code": "EJE2029"}],
   "intervenant": {"aurion_individu_id": "IND-3", "nom_affiche": "Intervenant Trois"}},
  {"aurion_seance_id": "S4", "aurion_intervention_id": "AUR-6",
   "debut": "2027-03-01T09:00:00+01:00", "fin": "2027-03-01T12:00:00+01:00",
   "cours_intitule": "Sociologie", "groupes": [],
   "intervenant": {"aurion_individu_id": "IND-1"}}
]$j$);

-- I3 : la fin de S1 passe à 12 h 30, sur ses deux lignes.
insert into t_lignes
select 'horaire', jsonb_agg(case when e ->> 'aurion_seance_id' = 'S1'
                                 then jsonb_set(e, '{fin}', '"2027-01-07T12:30:00+01:00"') else e end
                            order by o)
  from t_lignes, jsonb_array_elements(lignes) with ordinality as t (e, o)
 where nom = 'base';

-- I4 : S3 et S4 n'arrivent plus.
insert into t_lignes
select 'sans_s3', jsonb_agg(e order by o)
  from t_lignes, jsonb_array_elements(lignes) with ordinality as t (e, o)
 where nom = 'horaire' and e ->> 'aurion_seance_id' in ('S1', 'S2');

-- I6 : sur S2, IND-1 (AUR-3) disparaît et IND-4 (AUR-5) arrive ; sur S1,
-- IND-2 (AUR-2) est « Annulé » dans Aurion.
insert into t_lignes
select 'affectations', jsonb_agg(
         case when e ->> 'aurion_intervention_id' = 'AUR-3'
                then jsonb_set(jsonb_set(e, '{aurion_intervention_id}', '"AUR-5"'),
                               '{intervenant}', '{"aurion_individu_id": "IND-4", "nom_affiche": "Intervenant Quatre"}')
              when e ->> 'aurion_intervention_id' = 'AUR-2'
                then jsonb_set(e, '{statut_aurion}', '"Annulé"')
              else e end
         order by o)
  from t_lignes, jsonb_array_elements(lignes) with ordinality as t (e, o)
 where nom = 'sans_s3';

-- I7 : I6 + une ligne fin = début (S9), une ligne sans aurion_seance_id,
-- et une séance S5 sans intervenant (dans la plage).
insert into t_lignes
select 'invalides', lignes || $j$[
  {"aurion_seance_id": "S9", "aurion_intervention_id": "AUR-9",
   "debut": "2027-01-07T10:00:00+01:00", "fin": "2027-01-07T10:00:00+01:00",
   "intervenant": {"aurion_individu_id": "IND-1"}},
  {"aurion_intervention_id": "AUR-10",
   "debut": "2027-01-07T10:00:00+01:00", "fin": "2027-01-07T11:00:00+01:00",
   "intervenant": {"aurion_individu_id": "IND-1"}},
  {"aurion_seance_id": "S5",
   "debut": "2027-01-07T15:00:00+01:00", "fin": "2027-01-07T16:00:00+01:00",
   "cours_intitule": "Séance sans intervenant"}
]$j$::jsonb
  from t_lignes where nom = 'affectations';

-- I8 : séances « incomplètes ». Sur S1, la ligne d'IND-1 (AUR-1) devient
-- invalide et la ligne d'IND-2 (AUR-2) arrive sans groupe ; la ligne de
-- S5 devient invalide. S2 reste valide : la plage va du 07/01 9 h au 08/01
-- 12 h, et S5 (07/01 15 h) y tombe. Sans la garde « incomplète », AUR-1
-- serait retirée, le lien S1 ↔ ME2028 effacé, et S5 retirée.
insert into t_lignes
select 'incompletes', jsonb_agg(
         case when e ->> 'aurion_intervention_id' = 'AUR-1'
                then jsonb_set(e, '{fin}', e -> 'debut')
              when e ->> 'aurion_intervention_id' = 'AUR-2'
                then jsonb_set(e, '{groupes}', '[]')
              when e ->> 'aurion_seance_id' = 'S5'
                then jsonb_set(e, '{fin}', e -> 'debut')
              else e end
         order by o)
  from t_lignes, jsonb_array_elements(lignes) with ordinality as t (e, o)
 where nom = 'invalides';

-- I9 : Q13. Même (S1, IND-1) sous un nouveau code AUR-1B ; et la ligne de
-- S2 (IND-4) arrive sous le code AUR-2, déjà rattaché à (S1, IND-2).
insert into t_lignes
select 'q13', jsonb_agg(
         case when e ->> 'aurion_intervention_id' = 'AUR-1'
                then jsonb_set(e, '{aurion_intervention_id}', '"AUR-1B"')
              when e ->> 'aurion_intervention_id' = 'AUR-5'
                then jsonb_set(e, '{aurion_intervention_id}', '"AUR-2"')
              else e end
         order by o)
  from t_lignes, jsonb_array_elements(lignes) with ordinality as t (e, o)
 where nom = 'invalides';

-- I10 : I9 + une seconde ligne (S1, IND-1) sous un autre code (AUR-1D),
-- APRÈS la première ; et une séance S6 dont les groupes « GX » et « GX␠»
-- sont le même code à un espace près.
insert into t_lignes
select 'doublons', lignes
       || jsonb_build_array(
            jsonb_set((select e from jsonb_array_elements(lignes) e
                        where e ->> 'aurion_intervention_id' = 'AUR-1B'),
                      '{aurion_intervention_id}', '"AUR-1D"'))
       || $j$[{"aurion_seance_id": "S6",
               "debut": "2027-01-07T16:00:00+01:00", "fin": "2027-01-07T17:00:00+01:00",
               "groupes": [{"code": "GX", "intitule": "Groupe X"}, {"code": "GX "}]}]$j$::jsonb
  from t_lignes where nom = 'q13';

-- ── I1 : premier import ──────────────────────────────────────────────
set local role service_role;
insert into t_imp select 1, public.importer_seances((select lignes from t_lignes where nom = 'base'));
reset role;

select is(
  (select array[statut, nb_lues::text, nb_nouvelles::text, nb_modifiees::text, nb_retirees::text, nb_anomalies::text]
     from public.imports_aurion where id = (select id from t_imp where n = 1)),
  array['reussi', '5', '4', '0', '0', '0'],
  'I1 : reussi, 5 lues, 4 nouvelles, 0 modifiée, 0 retirée, 0 anomalie');
select ok((select fin is not null from public.imports_aurion where id = (select id from t_imp where n = 1)),
  'I1 : fin posée');
select is((select count(*)::int from public.interventions), 4, 'I1 : 4 séances');
select is((select count(*)::int from public.affectations where statut = 'prevu'), 5,
  'I1 : 5 affectations, toutes prevu (séances nouvelles)');
select is((select count(*)::int from public.intervention_groupes ig
             join public.interventions i on i.id = ig.intervention_id where i.aurion_seance_id = 'S2'),
  2, 'I1 : S2 liée à ses deux groupes');
select is((select salle_id is not null from public.interventions where aurion_seance_id = 'S1'), true,
  'I1 : salle reconnue (construite depuis les séances)');
select is((select role from public.affectations where aurion_intervention_id = 'AUR-1'), 'principal',
  'I1 : rôle repris');
select is((select nom_affiche from public.intervenants_aurion where aurion_individu_id = 'IND-3'),
  'Intervenant Trois', 'I1 : intervenant créé avec son nom affiché');
select is(
  (select count(*)::int from public.interventions_historique where import_id = (select id from t_imp where n = 1))
  + (select count(*)::int from public.affectations_historique where import_id = (select id from t_imp where n = 1)),
  9, 'I1 : 9 versions (4 séances + 5 affectations), toutes rattachées à I1');

-- ── I2 : réimport identique ──────────────────────────────────────────
create temp table t_compte as
select (select count(*) from public.interventions_historique)
     + (select count(*) from public.affectations_historique) as versions;

set local role service_role;
insert into t_imp select 2, public.importer_seances((select lignes from t_lignes where nom = 'base'));
reset role;

select is(
  (select array[statut, nb_lues::text, nb_nouvelles::text, nb_modifiees::text, nb_retirees::text]
     from public.imports_aurion where id = (select id from t_imp where n = 2)),
  array['reussi', '5', '0', '0', '0'],
  'I2 : réimport identique — 0 nouvelle, 0 modifiée, 0 retirée');
select is(
  (select count(*) from public.interventions_historique) + (select count(*) from public.affectations_historique),
  (select versions from t_compte),
  'I2 : aucune version d''historique écrite');
select is((select dernier_import_id from public.interventions where aurion_seance_id = 'S1'),
  (select id from t_imp where n = 2), 'I2 : dernier_import_id suit l''import (colonne non suivie)');

-- ── I3 : horaire modifié ─────────────────────────────────────────────
set local role service_role;
insert into t_imp select 3, public.importer_seances((select lignes from t_lignes where nom = 'horaire'));
reset role;

select is(
  (select array[nb_nouvelles, nb_modifiees, nb_retirees] from public.imports_aurion
    where id = (select id from t_imp where n = 3)),
  array[0, 1, 0], 'I3 : 1 séance modifiée');
select is(
  (select count(*)::int from public.interventions_historique where import_id = (select id from t_imp where n = 3)),
  1, 'I3 : une version de séance, rattachée à I3');
select is(
  (select fin from public.interventions_historique where import_id = (select id from t_imp where n = 3)),
  '2027-01-07 12:30+01'::timestamptz, 'I3 : la version porte le nouvel horaire');
select is(
  (select count(*)::int from public.affectations_historique where import_id = (select id from t_imp where n = 3)),
  0, 'I3 : aucune version d''affectation');

-- ── I4 : séance disparue ─────────────────────────────────────────────
set local role service_role;
insert into t_imp select 4, public.importer_seances((select lignes from t_lignes where nom = 'sans_s3'));
reset role;

select is(
  (select array[nb_nouvelles, nb_modifiees, nb_retirees] from public.imports_aurion
    where id = (select id from t_imp where n = 4)),
  array[0, 0, 1], 'I4 : 1 séance retirée');
select is((select statut from public.interventions where aurion_seance_id = 'S3'), 'retiree',
  'I4 : S3, absente et dans la plage, est retirée');
select is((select retiree_le from public.interventions where aurion_seance_id = 'S3'), now(),
  'I4 : date du retrait posée');
select is((select statut from public.interventions where aurion_seance_id = 'S4'), 'active',
  'I4 : S4, absente mais HORS plage, reste active');
select is((select statut from public.affectations where aurion_intervention_id = 'AUR-4'), 'prevu',
  'I4 : l''affectation d''une séance retirée ne change pas (provisoire Q14)');

-- Date de retrait antidatée, déclencheurs coupés (propriétaire, annulé
-- au rollback) : sans elle, « date inchangée » ne se distinguerait pas de
-- now() dans une seule transaction.
alter table public.interventions disable trigger user;
update public.interventions set retiree_le = '2026-02-01 00:00+00' where aurion_seance_id = 'S3';
alter table public.interventions enable trigger user;

-- ── I5 : séance retirée de nouveau absente ───────────────────────────
-- La RPC ne doit PAS toucher S3 (elle ne vise que les séances `active`).
-- Preuve : `nb_retirees = 0` (sans la condition, S3 serait recomptée),
-- aucune version, et la date d'origine du retrait inchangée.
set local role service_role;
insert into t_imp select 5, public.importer_seances((select lignes from t_lignes where nom = 'sans_s3'));
reset role;

select is(
  (select array[nb_nouvelles, nb_modifiees, nb_retirees] from public.imports_aurion
    where id = (select id from t_imp where n = 5)),
  array[0, 0, 0], 'I5 : S3 déjà retirée n''est pas retirée une seconde fois (nb_retirees = 0)');
select is((select retiree_le from public.interventions where aurion_seance_id = 'S3'),
  '2026-02-01 00:00+00'::timestamptz, 'I5 : la date d''origine du retrait n''est pas redatée');
select is(
  (select count(*)::int from public.interventions_historique where import_id = (select id from t_imp where n = 5))
  + (select count(*)::int from public.affectations_historique where import_id = (select id from t_imp where n = 5)),
  0, 'I5 : aucune version écrite (S3 n''est pas touchée)');

-- ── I6 : affectations changées ───────────────────────────────────────
set local role service_role;
insert into t_imp select 6, public.importer_seances((select lignes from t_lignes where nom = 'affectations'));
reset role;

select is(
  (select array[nb_nouvelles, nb_modifiees, nb_retirees] from public.imports_aurion
    where id = (select id from t_imp where n = 6)),
  array[0, 2, 0], 'I6 : S1 et S2 modifiées par leurs affectations');
select is((select statut from public.affectations where aurion_intervention_id = 'AUR-3'), 'retire',
  'I6 : affectation disparue d''une séance reçue → retire');
select is((select statut_depuis from public.affectations where aurion_intervention_id = 'AUR-3'), now(),
  'I6 : le retrait de l''affectation est daté');
select is((select statut from public.affectations where aurion_intervention_id = 'AUR-5'), 'ajoute',
  'I6 : nouvelle affectation sur une séance déjà connue → ajoute (provisoire Q8)');
select is((select statut from public.affectations where aurion_intervention_id = 'AUR-2'), 'annule',
  'I6 : statut_aurion « Annulé » → annule (provisoire Q6)');
select is((select statut_aurion from public.affectations where aurion_intervention_id = 'AUR-2'), 'Annulé',
  'I6 : le texte brut d''Aurion est gardé');
select is(
  (select count(*)::int from public.affectations_historique where import_id = (select id from t_imp where n = 6)),
  3, 'I6 : 3 versions d''affectation (retire, ajoute, annule), rattachées à I6');

-- ── I7 : lignes invalides, séance sans intervenant ───────────────────
set local role service_role;
insert into t_imp select 7, public.importer_seances((select lignes from t_lignes where nom = 'invalides'));
reset role;

select is(
  (select array[statut, nb_lues::text, nb_nouvelles::text, nb_anomalies::text]
     from public.imports_aurion where id = (select id from t_imp where n = 7)),
  array['reussi_avec_anomalies', '6', '1', '3'],
  'I7 : avec anomalies — 6 lues, 1 nouvelle (S5), 3 anomalies');
select is(
  (select count(*)::int from public.anomalies_import
    where import_id = (select id from t_imp where n = 7) and type = 'donnee_invalide'),
  2, 'I7 : 2 lignes invalides signalées (fin = début, séance sans identifiant)');
select is((select count(*)::int from public.interventions where aurion_seance_id = 'S9'), 0,
  'I7 : la ligne invalide n''est pas importée');
select is((select count(*)::int from public.affectations where aurion_intervention_id in ('AUR-9', 'AUR-10')), 0,
  'I7 : aucune affectation issue d''une ligne invalide');
select is((select statut from public.interventions where aurion_seance_id = 'S5'), 'active',
  'I7 : la séance sans intervenant est importée');
select is(
  (select count(*)::int from public.anomalies_import a
     join public.interventions i on i.id = a.intervention_id
    where a.import_id = (select id from t_imp where n = 7)
      and a.type = 'seance_sans_intervenant' and i.aurion_seance_id = 'S5'),
  1, 'I7 : anomalie seance_sans_intervenant rattachée à S5');
select is((select count(*)::int from public.anomalies_import where import_id = (select id from t_imp where n = 6)), 0,
  'I6 : aucune anomalie (elles sont propres à chaque import)');

-- ── I8 : séances incomplètes ─────────────────────────────────────────
set local role service_role;
insert into t_imp select 8, public.importer_seances((select lignes from t_lignes where nom = 'incompletes'));
reset role;

select is((select statut from public.affectations where aurion_intervention_id = 'AUR-1'), 'prevu',
  'I8 : S1 incomplète — l''affectation de la ligne invalide n''est pas retirée');
select is((select count(*)::int from public.intervention_groupes ig
             join public.interventions i on i.id = ig.intervention_id where i.aurion_seance_id = 'S1'),
  1, 'I8 : S1 incomplète — son lien de groupe n''est pas effacé');
select is((select statut from public.interventions where aurion_seance_id = 'S5'), 'active',
  'I8 : S5, nommée par une seule ligne invalide et dans la plage, n''est pas retirée');
select is((select statut from public.interventions where aurion_seance_id = 'S1'), 'active',
  'I8 : S1 reste active');
select is(
  (select count(*)::int from public.interventions_historique where import_id = (select id from t_imp where n = 8))
  + (select count(*)::int from public.affectations_historique where import_id = (select id from t_imp where n = 8)),
  0, 'I8 : aucune version écrite');

-- ── I9 : codes Aurion d'affectation (Q13) ────────────────────────────
create temp table t_uuid as
select aurion_intervention_id as code, id from public.affectations
 where aurion_intervention_id in ('AUR-1', 'AUR-2', 'AUR-5');

set local role service_role;
insert into t_imp select 9, public.importer_seances((select lignes from t_lignes where nom = 'q13'));
reset role;

select is((select id from public.affectations where aurion_intervention_id = 'AUR-1B'),
  (select id from t_uuid where code = 'AUR-1'),
  'I9 : nouveau code pour la même (séance, personne) → même UUID, code mis à jour');
select is(
  (select count(*)::int from public.affectations a join public.interventions i on i.id = a.intervention_id
    where i.aurion_seance_id = 'S1' and a.aurion_individu_id = 'IND-1'),
  1, 'I9 : aucune seconde affectation pour (S1, IND-1)');
select is(
  (select count(*)::int from public.anomalies_import
    where import_id = (select id from t_imp where n = 9) and type = 'donnee_invalide'
      and detail like '%AUR-2%déjà rattaché%'),
  1, 'I9 : code déjà rattaché à une autre séance ou personne → anomalie');
select is(
  (select array[a.id::text, i.aurion_seance_id, a.aurion_individu_id, a.statut]
     from public.affectations a join public.interventions i on i.id = a.intervention_id
    where a.aurion_intervention_id = 'AUR-2'),
  array[(select id::text from t_uuid where code = 'AUR-2'), 'S1', 'IND-2', 'annule'],
  'I9 : l''affectation qui porte ce code n''est pas réécrite');
select is(
  (select array[a.id::text, a.statut] from public.affectations a where a.aurion_intervention_id = 'AUR-5'),
  array[(select id::text from t_uuid where code = 'AUR-5'), 'ajoute'],
  'I9 : l''affectation de la ligne refusée garde son code et son statut (séance incomplète)');

-- ── I10 : doublons et codes de groupe à espaces ──────────────────────
set local role service_role;
insert into t_imp select 10, public.importer_seances((select lignes from t_lignes where nom = 'doublons'));
reset role;

select is(
  (select array_agg(aurion_intervention_id order by aurion_intervention_id) from public.affectations a
     join public.interventions i on i.id = a.intervention_id
    where i.aurion_seance_id = 'S1' and a.aurion_individu_id = 'IND-1'),
  array['AUR-1B'], 'I10 : deux lignes (S1, IND-1) à codes différents → la PREMIÈRE est gardée');
select is(
  (select count(*)::int from public.anomalies_import
    where import_id = (select id from t_imp where n = 10) and type = 'donnee_invalide'
      and detail like '%AUR-1D%'),
  1, 'I10 : la ligne suivante est signalée (donnee_invalide)');
select is(
  (select array_agg(aurion_code) from public.promotions_groupes where aurion_code like 'GX%'),
  array['GX'], 'I10 : « GX » et « GX␠» → un seul groupe, code sans espace');
select is((select count(*)::int from public.intervention_groupes ig
             join public.interventions i on i.id = ig.intervention_id where i.aurion_seance_id = 'S6'),
  1, 'I10 : S6 liée une seule fois');

-- ── I11 : réapparition d'une séance retirée (Q9) ─────────────────────
create temp table t_s3 as select id from public.interventions where aurion_seance_id = 'S3';

set local role service_role;
insert into t_imp select 11, public.importer_seances((select lignes from t_lignes where nom = 'horaire'));
reset role;

select is((select statut from public.interventions where aurion_seance_id = 'S3'), 'active',
  'I11 : S3 réapparaît → réactivée (provisoire Q9)');
select is((select retiree_le from public.interventions where aurion_seance_id = 'S3'), null::timestamptz,
  'I11 : retiree_le effacé');
select is((select id from public.interventions where aurion_seance_id = 'S3'), (select id from t_s3),
  'I11 : même UUID');
select is(
  (select array_agg(statut) from public.interventions_historique
    where intervention_id = (select id from t_s3) and import_id = (select id from t_imp where n = 11)),
  array['active'], 'I11 : une version écrite, rattachée à I11');

-- ── Refus par l'index unique « un seul import en cours » ─────────────
-- Ce test prouve le refus par l'INDEX : une ligne `en_cours` existe déjà.
-- Le verrou consultatif, lui, ne se teste pas dans une seule session :
-- `pg_try_advisory_xact_lock` réussit toujours pour la session qui le
-- tient déjà. Il faudrait deux connexions simultanées, ce que pgTAP ne
-- fait pas.
insert into public.imports_aurion (id, declenchement, statut)
values ('99999999-0000-0000-0000-000000000001', 'manuel', 'en_cours');
select throws_ok(
  $$ select public.importer_seances('[]'::jsonb) $$,
  '55P03', 'Import Aurion refusé : un autre import est en cours.',
  'ligne en_cours existante : import refusé par l''index unique, message clair');
select is((select count(*)::int from public.imports_aurion where statut = 'en_cours'), 1,
  'import refusé : aucune ligne d''import en plus');
update public.imports_aurion set statut = 'echec', fin = now()
 where id = '99999999-0000-0000-0000-000000000001';

select throws_ok(
  $$ select public.importer_seances('{"pas": "un tableau"}'::jsonb) $$,
  '22023', null, 'entrée qui n''est pas un tableau : refusée');

-- ── Droits d'exécution ───────────────────────────────────────────────
set local role anon;
select throws_ok($$ select public.importer_seances('[]'::jsonb) $$, '42501', null,
  'anon : importer_seances non exécutable');
reset role;
set local role authenticated;
select throws_ok($$ select public.importer_seances('[]'::jsonb) $$, '42501', null,
  'authenticated : importer_seances non exécutable');
reset role;

-- Les deux appels ci-dessus échoueraient AUSSI avec `execute` accordé :
-- la fonction est security invoker, et l'appelant n'a pas le droit
-- d'écrire dans imports_aurion (42501 plus loin). Le droit lui-même se
-- vérifie donc à part — sabotage mesuré le 2026-11-20.
select ok(not has_function_privilege('anon', 'public.importer_seances(jsonb, text, uuid)', 'execute'),
  'anon n''a pas execute sur importer_seances');
select ok(not has_function_privilege('authenticated', 'public.importer_seances(jsonb, text, uuid)', 'execute'),
  'authenticated n''a pas execute sur importer_seances');
select ok(not (select prosecdef from pg_proc where oid = 'public.importer_seances(jsonb, text, uuid)'::regprocedure),
  'importer_seances est security invoker');
select ok(has_function_privilege('service_role', 'public.importer_seances(jsonb, text, uuid)', 'execute'),
  'service_role exécute importer_seances');

-- ── import_id sur TOUTES les versions écrites ────────────────────────
select is_empty(
  $$ select 'intervention', id from public.interventions_historique where import_id is null
     union all
     select 'affectation', id from public.affectations_historique where import_id is null $$,
  'toutes les versions écrites par les imports portent leur import_id');
select is(
  (select array_agg(t.n order by h.id) from public.interventions_historique h
     join t_imp t on t.id = h.import_id
    where h.intervention_id = (select id from t_s3)),
  array[1, 4, 11], 'versions de S3 : création (I1), retrait (I4), réactivation (I11), rien d''autre');

select * from finish();
rollback;
