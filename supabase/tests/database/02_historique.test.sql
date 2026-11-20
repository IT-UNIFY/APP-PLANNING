-- =====================================================================
-- 02_historique.test.sql — historique daté, ajout seul, état à J, pas
-- de suppression physique (ADR-001 D5, D6).
--
-- Joué en propriétaire des tables (le rôle qui exécute `supabase test
-- db`) : c'est le cas le plus fort. Les droits n'arrêtent pas le
-- propriétaire ; seuls les déclencheurs le font, et c'est ce qu'on prouve.
-- Les cas `service_role` prouvent en plus le `revoke` nommé.
--
-- Une transaction de test a une seule heure (`now()`). Les déclencheurs
-- refusent qu'un écrivain fournisse `updated_at`, `statut_depuis` ou
-- `retiree_le` (pas d'antidatage). Pour observer « inchangé », le test pose
-- donc des dates passées en COUPANT les déclencheurs le temps d'un
-- `update` (`alter table … disable trigger user`, permis au propriétaire,
-- annulé par le `rollback`). C'est le seul endroit où ils sont coupés.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- ── Jeu de données ───────────────────────────────────────────────────
insert into public.imports_aurion (id, declenchement, statut, fin) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'automatique', 'reussi', now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'automatique', 'reussi', now());

insert into public.intervenants_aurion (aurion_individu_id) values ('IND-1'), ('IND-2');

-- Tentative d'antidatage à la création : les dates fournies sont écrasées.
insert into public.interventions (id, aurion_seance_id, debut, fin, cours_intitule, updated_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'SEANCE-1',
        '2027-01-07 09:00+01', '2027-01-07 12:00+01', 'Droit de la famille',
        '2026-01-01 00:00+00');

insert into public.affectations (id, intervention_id, aurion_individu_id, statut, statut_depuis, updated_at)
values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'IND-1',
   'prevu', '2026-01-01 00:00+00', '2026-01-01 00:00+00'),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'IND-2',
   'prevu', '2026-01-01 00:00+00', '2026-01-01 00:00+00');

select is(
  (select updated_at from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  now(), 'création de séance : updated_at fourni écrasé par now() (pas d''antidatage)');
select is(
  (select updated_at from public.affectations where id = 'cccccccc-0000-0000-0000-000000000001'),
  now(), 'création d''affectation : updated_at fourni écrasé par now()');
select is(
  (select statut_depuis from public.affectations where id = 'cccccccc-0000-0000-0000-000000000001'),
  now(), 'création d''affectation : statut_depuis fourni écrasé par now()');

-- Dates passées posées déclencheurs coupés (voir l'en-tête).
alter table public.interventions disable trigger user;
update public.interventions set updated_at = '2026-01-01 00:00+00'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
alter table public.interventions enable trigger user;
alter table public.affectations disable trigger user;
update public.affectations set updated_at = '2026-01-01 00:00+00', statut_depuis = '2026-01-01 00:00+00';
alter table public.affectations enable trigger user;

-- ── Écriture de l'historique ─────────────────────────────────────────
select is(
  (select count(*)::int from public.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000001' and operation = 'insert'),
  1, 'création d''une séance : une version');

-- Mise à jour SANS changement : ni version, ni nouvel updated_at.
update public.interventions set cours_intitule = cours_intitule
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  1, 'mise à jour sans changement : aucune version');
select is(
  (select updated_at from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  '2026-01-01 00:00+00'::timestamptz, 'mise à jour sans changement : updated_at inchangé');

-- Colonne NON suivie (dernier_import_id) : ni version, ni updated_at.
update public.interventions set dernier_import_id = 'aaaaaaaa-0000-0000-0000-000000000001'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  1, 'colonne non suivie : aucune version');
select is(
  (select updated_at from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  '2026-01-01 00:00+00'::timestamptz, 'colonne non suivie : updated_at inchangé');

-- Vrai changement d'horaire, porté par un import identifié.
set local planning.import_id to 'aaaaaaaa-0000-0000-0000-000000000002';
update public.interventions set fin = '2027-01-07 12:30+01'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  2, 'changement d''horaire : une nouvelle version');
select is(
  (select updated_at from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  now(), 'changement d''horaire : updated_at = heure de transaction');
select is(
  (select import_id from public.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    order by valide_depuis desc, id desc limit 1),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'la version porte l''import qui l''a produite');
select is(
  (select fin from public.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    order by valide_depuis desc, id desc limit 1),
  '2027-01-07 12:30+01'::timestamptz, 'la version copie la valeur nouvelle');

-- Retrait : la base date le retrait.
update public.interventions set statut = 'retiree'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is(
  (select retiree_le from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  now(), 'retrait : retiree_le posé par la base');

-- Séance DÉJÀ retirée : la date du retrait ne bouge plus. Date passée
-- posée déclencheurs coupés, puis un upsert d'import la renvoie.
alter table public.interventions disable trigger user;
update public.interventions set retiree_le = '2026-02-01 00:00+00', updated_at = '2026-02-01 00:00+00'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
alter table public.interventions enable trigger user;

insert into public.interventions (aurion_seance_id, debut, fin, cours_intitule, statut, retiree_le)
values ('SEANCE-1', '2027-01-07 09:00+01', '2027-01-07 12:30+01', 'Droit de la famille', 'retiree', null)
on conflict (aurion_seance_id) do update
   set debut = excluded.debut, fin = excluded.fin, cours_intitule = excluded.cours_intitule,
       statut = excluded.statut, retiree_le = excluded.retiree_le;
select is(
  (select retiree_le from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  '2026-02-01 00:00+00'::timestamptz, 'séance retirée : un upsert garde la date d''origine du retrait');
select is(
  (select count(*)::int from public.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  3, 'séance retirée : l''upsert identique ne crée pas de version');
select is(
  (select updated_at from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  '2026-02-01 00:00+00'::timestamptz, 'séance retirée : l''upsert identique ne touche pas updated_at');

update public.interventions set retiree_le = null
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is(
  (select retiree_le from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  '2026-02-01 00:00+00'::timestamptz, 'séance retirée : retiree_le ne peut pas être remis à NULL');

-- Changement de statut d'affectation : statut_depuis daté par le Planning.
update public.affectations set statut = 'annule', statut_aurion = 'annulé'
 where id = 'cccccccc-0000-0000-0000-000000000001';
select is(
  (select statut_depuis from public.affectations where id = 'cccccccc-0000-0000-0000-000000000001'),
  now(), 'statut changé : statut_depuis = heure de transaction');
select is(
  (select count(*)::int from public.affectations_historique
    where affectation_id = 'cccccccc-0000-0000-0000-000000000001'),
  2, 'statut changé : une nouvelle version d''affectation');

update public.affectations set statut = statut where id = 'cccccccc-0000-0000-0000-000000000002';
select is(
  (select updated_at from public.affectations where id = 'cccccccc-0000-0000-0000-000000000002'),
  '2026-01-01 00:00+00'::timestamptz, 'affectation sans changement : updated_at inchangé');

-- statut_depuis fourni sans changement de statut : ignoré, pas de version.
update public.affectations set statut_depuis = '2020-01-01 00:00+00'
 where id = 'cccccccc-0000-0000-0000-000000000002';
select is(
  (select statut_depuis from public.affectations where id = 'cccccccc-0000-0000-0000-000000000002'),
  '2026-01-01 00:00+00'::timestamptz, 'statut_depuis ne se redate pas sans changement de statut');
select is(
  (select count(*)::int from public.affectations_historique
    where affectation_id = 'cccccccc-0000-0000-0000-000000000002'),
  1, 'statut_depuis fourni seul : aucune version');

-- L'identité d'une affectation ne change pas.
select throws_ok(
  $$ update public.affectations set aurion_individu_id = 'IND-2'
      where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  'P0001', null, 'affectation : changer de personne est refusé (nouvelle affectation)');

-- ── Pas de suppression physique ──────────────────────────────────────
select throws_ok(
  $$ delete from public.interventions where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$,
  'P0001', null, 'séance : suppression refusée, même au propriétaire');
select throws_ok(
  $$ delete from public.affectations where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  'P0001', null, 'affectation : suppression refusée, même au propriétaire');

set local role service_role;
select throws_ok(
  $$ delete from public.affectations where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  '42501', null, 'affectation : service_role n''a pas le droit delete (retiré nommément)');
select lives_ok(
  $$ update public.affectations set statut = 'retire' where id = 'cccccccc-0000-0000-0000-000000000002' $$,
  'service_role : le retrait (statut) reste possible');
reset role;

-- ── Ajout seul ───────────────────────────────────────────────────────
select throws_ok(
  $$ update public.affectations_historique set statut = 'prevu' $$,
  'P0001', null, 'historique : update refusé au propriétaire');
select throws_ok(
  $$ delete from public.interventions_historique $$,
  'P0001', null, 'historique : delete refusé au propriétaire');
select throws_ok(
  $$ truncate public.affectations_historique $$,
  'P0001', null, 'historique : truncate refusé au propriétaire');

set local role service_role;
select throws_ok(
  $$ update public.affectations_historique set statut = 'prevu' $$,
  '42501', null, 'historique : service_role n''a pas le droit update');
select throws_ok(
  $$ insert into public.affectations_historique
       (affectation_id, operation, intervention_id, aurion_individu_id, statut, statut_depuis)
     values ('cccccccc-0000-0000-0000-000000000001', 'update',
             'bbbbbbbb-0000-0000-0000-000000000001', 'IND-1', 'prevu', now()) $$,
  '42501', null, 'historique : service_role ne peut pas fabriquer une version');
reset role;

-- ── État à la date J ─────────────────────────────────────────────────
-- Versions passées posées à la main (le propriétaire a `insert`), pour
-- avoir des dates distinctes dans une seule transaction.
insert into public.affectations_historique
  (affectation_id, valide_depuis, operation, intervention_id, aurion_individu_id, statut, statut_depuis)
values
  ('cccccccc-0000-0000-0000-000000000002', '2026-03-01 00:00+00', 'update',
   'bbbbbbbb-0000-0000-0000-000000000001', 'IND-2', 'prevu', '2026-03-01 00:00+00'),
  ('cccccccc-0000-0000-0000-000000000002', '2026-04-01 00:00+00', 'update',
   'bbbbbbbb-0000-0000-0000-000000000001', 'IND-2', 'remplace', '2026-04-01 00:00+00');

select is(
  (select statut from api_v1.affectations_historique
    where affectation_id = 'cccccccc-0000-0000-0000-000000000002'
      and valide_depuis <= '2026-03-15' and (valide_jusqua is null or valide_jusqua > '2026-03-15')),
  'prevu', 'état au 15/03 : prevu');
select is(
  (select statut from api_v1.affectations_historique
    where affectation_id = 'cccccccc-0000-0000-0000-000000000002'
      and valide_depuis <= '2026-04-15' and (valide_jusqua is null or valide_jusqua > '2026-04-15')),
  'remplace', 'état au 15/04 : remplace');
select is(
  (select valide_jusqua from api_v1.affectations_historique
    where affectation_id = 'cccccccc-0000-0000-0000-000000000002'
      and valide_depuis = '2026-03-01 00:00+00'),
  '2026-04-01 00:00+00'::timestamptz, 'une version vaut jusqu''à la suivante');
select is(
  (select count(*)::int from api_v1.affectations_historique
    where affectation_id = 'cccccccc-0000-0000-0000-000000000002'
      and valide_depuis <= '2026-02-01' and (valide_jusqua is null or valide_jusqua > '2026-02-01')),
  0, 'avant la première version : aucun état');

-- ── État d'une SÉANCE à la date J : horaires modifiés entre deux imports ─
-- Séance créée « aujourd'hui » (version du déclencheur, à now()), puis
-- deux versions passées posées à la main, une par import : l'import 1
-- pose 9 h-12 h le 01/05, l'import 2 décale la fin à 12 h 30 le 01/06.
insert into public.interventions (id, aurion_seance_id, debut, fin, cours_intitule)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'SEANCE-2',
        '2027-02-04 09:00+01', '2027-02-04 12:30+01', 'Atelier d''écriture');

insert into public.interventions_historique
  (intervention_id, valide_depuis, import_id, operation, aurion_seance_id, debut, fin, cours_intitule, statut)
values
  ('bbbbbbbb-0000-0000-0000-000000000002', '2026-05-01 02:00+00', 'aaaaaaaa-0000-0000-0000-000000000001',
   'insert', 'SEANCE-2', '2027-02-04 09:00+01', '2027-02-04 12:00+01', 'Atelier d''écriture', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '2026-06-01 02:00+00', 'aaaaaaaa-0000-0000-0000-000000000002',
   'update', 'SEANCE-2', '2027-02-04 09:00+01', '2027-02-04 12:30+01', 'Atelier d''écriture', 'active');

select is(
  (select fin from api_v1.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and valide_depuis <= '2026-05-15' and (valide_jusqua is null or valide_jusqua > '2026-05-15')),
  '2027-02-04 12:00+01'::timestamptz, 'séance au 15/05 : fin à 12 h (import 1)');
select is(
  (select fin from api_v1.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and valide_depuis <= '2026-06-15' and (valide_jusqua is null or valide_jusqua > '2026-06-15')),
  '2027-02-04 12:30+01'::timestamptz, 'séance au 15/06 : fin à 12 h 30 (import 2)');
select is(
  (select import_id from api_v1.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and valide_depuis <= '2026-06-15' and (valide_jusqua is null or valide_jusqua > '2026-06-15')),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'séance au 15/06 : rattachée à l''import qui a changé l''horaire');
select is(
  (select valide_jusqua from api_v1.interventions_historique
    where intervention_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and valide_depuis = '2026-05-01 02:00+00'),
  '2026-06-01 02:00+00'::timestamptz, 'une version de séance vaut jusqu''à la suivante');

select * from finish();
rollback;
