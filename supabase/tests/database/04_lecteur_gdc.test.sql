-- =====================================================================
-- 04_lecteur_gdc.test.sql — l'identité technique de GDC ne voit que
-- api_v1 (ADR-001 D2, D3), et api_v1 ne sert qu'elle.
--
-- ⚠️ Un `grant` en tête, annulé par le `rollback` final : `lecteur_gdc`
-- au rôle qui joue le test. Depuis Postgres 16, le créateur d'un rôle
-- reçoit l'option ADMIN mais PAS le droit de `set role` vers lui (mesuré
-- en local, Postgres 16, rôle non superutilisateur, le 2026-11-20). Sans
-- ce grant, `set local role lecteur_gdc` est refusé. Il n'existe pas hors
-- de ce test.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

do $$
begin
  if not pg_has_role(current_user, 'lecteur_gdc', 'SET') then
    execute format('grant lecteur_gdc to %I', current_user);
  end if;
end;
$$;

-- ── Jeu de données ───────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@epss.test');
insert into public.user_roles (user_id, role_code)
values ('11111111-1111-1111-1111-111111111111', 'admin_planning');

insert into public.imports_aurion (id, declenchement, statut, debut, fin) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'automatique', 'reussi', now() - interval '2 days', now() - interval '2 days'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'manuel', 'echec', now() - interval '1 day', now() - interval '1 day');

insert into public.salles (id, nom, site) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Salle 12', 'Site principal');
insert into public.promotions_groupes (id, aurion_code, intitule, nature) values
  ('ffffffff-0000-0000-0000-000000000001', 'ME2028', 'ME 2028', 'promotion');
insert into public.intervenants_aurion (aurion_individu_id, nom_affiche) values
  ('IND-1', 'Intervenant Un'), ('IND-2', 'Intervenant Deux');

insert into public.interventions (id, aurion_seance_id, debut, fin, cours_intitule, salle_id)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'SEANCE-1',
        '2027-01-07 09:00+01', '2027-01-07 12:00+01', 'Droit de la famille',
        'eeeeeeee-0000-0000-0000-000000000001');
-- Horaire modifié par un import : la séance a deux versions.
set local planning.import_id to 'aaaaaaaa-0000-0000-0000-000000000001';
update public.interventions set fin = '2027-01-07 12:30+01'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
insert into public.intervention_groupes (intervention_id, groupe_id)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001');
insert into public.affectations (id, intervention_id, aurion_individu_id, role) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'IND-1', 'principal'),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'IND-2', 'co_intervenant');

insert into public.anomalies_import (import_id, type)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'intervenant_sans_fiche');

-- ── Contrat : aucun nom de personne dans api_v1 ──────────────────────
select is_empty(
  $$ select table_name, column_name from information_schema.columns
      where table_schema = 'api_v1'
        and column_name in ('nom_affiche', 'full_name', 'email', 'nom', 'prenom') $$,
  'api_v1 n''expose aucun nom de personne');

-- ── lecteur_gdc : ce qu'il lit, ce qu'on lui refuse ──────────────────
-- Les lectures se font SOUS lecteur_gdc, dans un bloc DO qui note chaque
-- résultat (ou le SQLSTATE de l'erreur) dans une table temporaire. Les
-- assertions pgTAP se font ensuite, rôle rétabli : lecteur_gdc n'a ainsi
-- besoin d'aucun droit sur le schéma de pgTAP.
create temp table resultats_gdc (cle text primary key, valeur text);
grant all on table resultats_gdc to public;

set local role lecteur_gdc;
do $$
declare
  v text;
  -- Chaque requête est jouée dans son propre sous-bloc : une erreur
  -- attendue (42501) ne doit pas masquer les suivantes.
  r record;
begin
  for r in
    select * from (values
      ('api_interventions',  'select count(*)::text from api_v1.interventions'),
      ('api_salle_nom',      'select salle_nom from api_v1.interventions'),
      ('api_affectations',   'select count(*)::text from api_v1.affectations'),
      ('api_aff_ind1',       $q$select count(*)::text from api_v1.affectations_intervenant where aurion_individu_id = 'IND-1'$q$),
      ('api_aff_groupe',     $q$select groupes -> 0 ->> 'aurion_code' from api_v1.affectations_intervenant where affectation_id = 'cccccccc-0000-0000-0000-000000000001'$q$),
      ('api_changements',    'select count(*)::text from api_v1.changements'),
      ('api_historique',     'select count(*)::text from api_v1.affectations_historique'),
      ('api_dernier_import', 'select id::text from api_v1.dernier_import'),
      ('api_int_historique', 'select count(*)::text from api_v1.interventions_historique'),
      ('api_int_hist_fin',   $q$select to_char(fin at time zone 'Europe/Paris', 'HH24:MI') from api_v1.interventions_historique where valide_jusqua is null$q$),
      ('api_int_hist_salle', $q$select salle_nom from api_v1.interventions_historique where valide_jusqua is null$q$),
      ('pub_interventions',  'select count(*)::text from (select * from public.interventions) q'),
      ('pub_intervenants',   'select count(nom_affiche)::text from public.intervenants_aurion'),
      ('pub_anomalies',      'select count(*)::text from public.anomalies_import'),
      ('pub_profiles',       'select count(*)::text from public.profiles'),
      ('pub_int_historique', 'select count(*)::text from (select * from public.interventions_historique) q'),
      ('pub_a_role',         $q$select public.a_role('admin_planning')::text$q$)
    ) t (cle, requete)
  loop
    begin
      execute r.requete into v;
    exception when others then
      v := 'ERREUR ' || sqlstate;
    end;
    insert into resultats_gdc values (r.cle, v);
  end loop;

  begin
    update public.affectations set statut = 'annule';
    v := 'écrit';
  exception when others then
    v := 'ERREUR ' || sqlstate;
  end;
  insert into resultats_gdc values ('pub_update_affectations', v);
end;
$$;
reset role;

select is((select valeur from resultats_gdc where cle = 'api_interventions'), '1',
  'lecteur_gdc lit api_v1.interventions');
select is((select valeur from resultats_gdc where cle = 'api_salle_nom'), 'Salle 12',
  'api_v1.interventions : salle reconnue');
select is((select valeur from resultats_gdc where cle = 'api_affectations'), '2',
  'lecteur_gdc lit api_v1.affectations');
select is((select valeur from resultats_gdc where cle = 'api_aff_ind1'), '1',
  'affectations_intervenant filtrée par l''appelant');
select is((select valeur from resultats_gdc where cle = 'api_aff_groupe'), 'ME2028',
  'affectations_intervenant porte les groupes de la séance');
select is((select valeur from resultats_gdc where cle = 'api_changements'), '3',
  'changements : 1 séance + 2 affectations');
select is((select valeur from resultats_gdc where cle = 'api_historique'), '2',
  'lecteur_gdc lit l''historique daté');
select is((select valeur from resultats_gdc where cle = 'api_dernier_import'),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'dernier_import : le dernier RÉUSSI, pas l''échec plus récent');
select is((select valeur from resultats_gdc where cle = 'api_int_historique'), '2',
  'lecteur_gdc lit api_v1.interventions_historique (création + horaire modifié)');
select is((select valeur from resultats_gdc where cle = 'api_int_hist_fin'), '12:30',
  'interventions_historique : la version en vigueur porte le nouvel horaire');
select is((select valeur from resultats_gdc where cle = 'api_int_hist_salle'), 'Salle 12',
  'interventions_historique : salle de la version');

select is((select valeur from resultats_gdc where cle = 'pub_interventions'), 'ERREUR 42501',
  'lecteur_gdc : select * sur la table source refusé (colonnes non accordées)');
select is((select valeur from resultats_gdc where cle = 'pub_intervenants'), 'ERREUR 42501',
  'lecteur_gdc : aucun accès aux noms des intervenants');
select is((select valeur from resultats_gdc where cle = 'pub_anomalies'), 'ERREUR 42501',
  'lecteur_gdc : aucun accès aux anomalies');
select is((select valeur from resultats_gdc where cle = 'pub_profiles'), 'ERREUR 42501',
  'lecteur_gdc : aucun accès aux profils');
select is((select valeur from resultats_gdc where cle = 'pub_int_historique'), 'ERREUR 42501',
  'lecteur_gdc : select * sur l''historique des séances refusé (colonnes hors preuve non accordées)');
select is((select valeur from resultats_gdc where cle = 'pub_a_role'), 'ERREUR 42501',
  'lecteur_gdc : a_role() non exécutable');
select is((select valeur from resultats_gdc where cle = 'pub_update_affectations'), 'ERREUR 42501',
  'lecteur_gdc : aucune écriture');

-- ── api_v1 fermé au navigateur ───────────────────────────────────────
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select count(*) from api_v1.interventions $$,
  '42501', null, 'authenticated (même admin) : api_v1 refusé');
select throws_ok(
  $$ select count(*) from api_v1.interventions_historique $$,
  '42501', null, 'authenticated (même admin) : api_v1.interventions_historique refusé');
select is((select count(*)::int from public.interventions), 1,
  'authenticated admin : lit bien public.interventions (témoin)');
reset role;

set local role anon;
select throws_ok(
  $$ select count(*) from api_v1.affectations $$,
  '42501', null, 'anon : api_v1 refusé');
select throws_ok(
  $$ select count(*) from api_v1.interventions_historique $$,
  '42501', null, 'anon : api_v1.interventions_historique refusé');
reset role;

select * from finish();
rollback;
