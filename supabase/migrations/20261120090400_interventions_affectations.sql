-- =====================================================================
-- 20261120090400_interventions_affectations.sql — APP-PLANNING, lot 1
--
-- Les séances (« interventions ») et, sous chacune, une ligne par
-- intervenant (« affectations »).
--
-- VOCABULAIRE — piège mesuré chez GDC (`aurion_dpae_intake`) :
-- l'`id.Intervention` d'Aurion est une ligne PAR INDIVIDU, donc notre
-- AFFECTATION ; la séance d'Aurion est notre INTERVENTION. D'où
-- `affectations.aurion_intervention_id` et `interventions.aurion_seance_id`.
--
-- CLÉS (ADR-001 D5) : chaque intervention et chaque affectation a un UUID
-- du Planning QUI NE CHANGE JAMAIS — l'outil Intervenant y rattache
-- contrats et état de paie. Les identifiants Aurion sont gardés comme
-- anciens codes, cherchables, et NULLABLES : au Planning complet, une
-- séance saisie dans le Planning n'aura pas de code Aurion, et le lot 1
-- utilise déjà le modèle de l'outil complet (carnet, Lot 1).
--
-- RIEN NE S'EFFACE (ADR-001 D5) : une séance retirée d'Aurion passe à
-- `statut = 'retiree'` ; une affectation retirée passe à `retire`. Un
-- déclencheur refuse le `delete`.
--
-- `updated_at` ne bouge que si une colonne SUIVIE change : c'est le
-- curseur de `api_v1.changements`. La liste des colonnes suivies est
-- écrite UNE fois par table, dans `*_suivi_change()`, que le déclencheur
-- de ce fichier ET celui de l'historique (20261120090500) appellent :
-- deux listes divergeraient, et l'historique ne dirait plus la même chose
-- que le flux des changements.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. interventions — une séance.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  aurion_seance_id text unique,
  debut timestamptz not null,
  fin timestamptz not null,
  cours_code text,
  cours_intitule text,
  type_activite text,
  modalite text,
  -- Salle reconnue, ou NULL avec le nom brut d'Aurion à côté (anomalie
  -- `salle_inconnue`) : on n'invente pas de salle.
  salle_id uuid references public.salles (id),
  salle_nom_aurion text,
  -- État brut tel qu'Aurion le donne, sans interprétation.
  etat_aurion text,
  statut text not null default 'active'
    check (statut in ('active', 'retiree')),
  retiree_le timestamptz,
  -- Date de dernière mise à jour SELON AURION : information seulement.
  -- La date qui fait preuve est celle du Planning (Q10).
  aurion_maj_le timestamptz,
  dernier_import_id uuid references public.imports_aurion (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interventions_fin_apres_debut check (fin > debut),
  -- La date du retrait existe si et seulement si la séance est retirée :
  -- « retirée, sans date » ne prouverait rien.
  constraint interventions_retrait_date check ((statut = 'retiree') = (retiree_le is not null))
);

comment on table public.interventions is
  'Séances importées d''Aurion. id = UUID stable du Planning ; '
  'aurion_seance_id = ancien code. Pas de suppression physique : retrait = '
  'statut retiree. Écritures par l''Edge Function d''import (service_role).';

comment on column public.interventions.dernier_import_id is
  'Dernier import qui a vu cette séance dans Aurion. Colonne NON suivie : '
  'la changer ne touche ni updated_at ni l''historique.';

create index if not exists interventions_debut_idx on public.interventions (debut);
create index if not exists interventions_salle_debut_idx on public.interventions (salle_id, debut);
create index if not exists interventions_maj_idx on public.interventions (updated_at, id);

alter table public.interventions enable row level security;

-- Liste UNIQUE des colonnes suivies de `interventions`. Ajouter une
-- colonne métier = l'ajouter ici ET dans la copie de l'historique.
create or replace function public.interventions_suivi_change(
  o public.interventions,
  n public.interventions
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select row(o.aurion_seance_id, o.debut, o.fin, o.cours_code, o.cours_intitule,
             o.type_activite, o.modalite, o.salle_id, o.salle_nom_aurion,
             o.etat_aurion, o.statut, o.retiree_le)
         is distinct from
         row(n.aurion_seance_id, n.debut, n.fin, n.cours_code, n.cours_intitule,
             n.type_activite, n.modalite, n.salle_id, n.salle_nom_aurion,
             n.etat_aurion, n.statut, n.retiree_le);
$$;

comment on function public.interventions_suivi_change(public.interventions, public.interventions) is
  'Vrai si une colonne suivie d''une intervention change. Source unique de '
  'la liste : updated_at et historique en dépendent. aurion_maj_le et '
  'dernier_import_id sont volontairement hors suivi.';

create or replace function public.interventions_avant_ecriture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'interventions.id ne change jamais (UUID stable, ADR-001 D5)'
      using errcode = 'P0001';
  end if;

  -- DATES TENUES PAR LA BASE, JAMAIS PAR L'ÉCRIVAIN. `updated_at` est le
  -- curseur de `api_v1.changements` et `retiree_le` une date de preuve :
  -- si l'écrivain pouvait les fournir, il pourrait antidater une ligne (un
  -- lecteur déjà passé ne la verrait jamais) ou redater un retrait. Toute
  -- valeur fournie est donc ÉCRASÉE ici, à l'INSERT comme à l'UPDATE.
  --
  -- retiree_le :
  --   * séance active → NULL ;
  --   * séance qui devient retirée (ou créée retirée) → now() ;
  --   * séance déjà retirée qui le reste → date d'origine gardée, même si
  --     un upsert d'import renvoie NULL ou une autre date.
  if new.statut = 'active' then
    new.retiree_le := null;
  elsif tg_op = 'UPDATE' and old.statut = 'retiree' then
    new.retiree_le := coalesce(old.retiree_le, now());
  else
    new.retiree_le := now();
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.created_at := old.created_at;
    if public.interventions_suivi_change(old, new) then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_interventions_avant_ecriture on public.interventions;
create trigger trg_interventions_avant_ecriture
  before insert or update on public.interventions
  for each row execute function public.interventions_avant_ecriture();

drop trigger if exists trg_interventions_pas_de_suppression on public.interventions;
create trigger trg_interventions_pas_de_suppression
  before delete on public.interventions
  for each row execute function public.refuser_ecriture('une séance se retire (statut retiree), elle ne se supprime pas');

drop policy if exists interventions_select on public.interventions;
create policy interventions_select
  on public.interventions for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );

revoke all on table public.interventions from anon, authenticated;
-- service_role : droits accordés NOMMÉMENT. Les Edge Functions écrivent
-- sous ce rôle ; s'en remettre aux privilèges par défaut du projet, qui
-- peuvent différer d'une image à l'autre, ferait échouer l'import en
-- production sans que rien ne le signale ici. 20261120090700 le vérifie.
grant select, insert, update on table public.interventions to service_role;
-- Ni `delete` ni `truncate`, retirés nommément : une séance ne se supprime
-- pas, et TRUNCATE passerait sous le déclencheur BEFORE DELETE. Le retrait
-- nommé rend le refus identique quels que soient les privilèges par défaut.
revoke delete, truncate on table public.interventions from service_role;
grant select on table public.interventions to authenticated;

-- Clé étrangère d'`anomalies_import` vers `interventions`, laissée en
-- attente par 20261120090300 (la table n'existait pas encore). Bloc
-- conditionnel : Postgres n'a pas d'`add constraint if not exists`.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'anomalies_import_intervention_id_fkey'
       and conrelid = 'public.anomalies_import'::regclass
  ) then
    alter table public.anomalies_import
      add constraint anomalies_import_intervention_id_fkey
      foreign key (intervention_id) references public.interventions (id);
  end if;
end;
$$;

create index if not exists anomalies_import_intervention_id_idx
  on public.anomalies_import (intervention_id);

-- ─────────────────────────────────────────────────────────────────────
-- 2. intervention_groupes — séance ↔ promotion ou groupe, n-n (Q4).
--    Un cours commun à plusieurs promotions est UNE séance (carnet).
--    Table de liaison : une ligne retirée se supprime (pas d'historique
--    des groupes au lot 1).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.intervention_groupes (
  intervention_id uuid not null references public.interventions (id),
  groupe_id uuid not null references public.promotions_groupes (id),
  created_at timestamptz not null default now(),
  primary key (intervention_id, groupe_id)
);

comment on table public.intervention_groupes is
  'Liaison n-n séance ↔ promotion ou groupe, telle que dans Aurion.';

create index if not exists intervention_groupes_groupe_id_idx
  on public.intervention_groupes (groupe_id);

alter table public.intervention_groupes enable row level security;

drop policy if exists intervention_groupes_select on public.intervention_groupes;
create policy intervention_groupes_select
  on public.intervention_groupes for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );

revoke all on table public.intervention_groupes from anon, authenticated;
-- `delete` : une liaison retirée d'Aurion se supprime (pas d'historique
-- des groupes au lot 1).
grant select, insert, update, delete on table public.intervention_groupes to service_role;
grant select on table public.intervention_groupes to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. affectations — une ligne intervenant × intervention (Q1).
--
--    Statut selon le carnet (Q2) : prevu | ajoute | annule | remplace |
--    retire, daté par `statut_depuis`. `statut_aurion` garde le texte
--    brut d'Aurion (dont « réalisé »), sans le traduire.
--
--    `remplacee_par` reste VIDE tant qu'Aurion ne donne pas le lien
--    (Q3) : on ne déduit pas un remplaçant, une erreur de déduction
--    ferait payer la mauvaise personne.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.affectations (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions (id),
  aurion_individu_id text not null references public.intervenants_aurion (aurion_individu_id),
  -- Ancien code : l'`id.Intervention` d'Aurion (une ligne par individu).
  aurion_intervention_id text unique,
  role text check (role in ('principal', 'co_intervenant', 'soutien_interne', 'remplacant')),
  statut text not null default 'prevu'
    check (statut in ('prevu', 'ajoute', 'annule', 'remplace', 'retire')),
  statut_aurion text,
  -- Date du dernier changement de `statut`, heure de transaction du
  -- Planning (Q10) : c'est elle qui fait preuve, pas la date d'Aurion.
  statut_depuis timestamptz not null default now(),
  remplacee_par uuid references public.affectations (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affectations_intervenant_unique unique (intervention_id, aurion_individu_id),
  constraint affectations_pas_remplacee_par_elle_meme check (remplacee_par is distinct from id)
);

comment on table public.affectations is
  'Une ligne par intervenant et par séance. id = UUID stable du Planning, '
  'auquel l''outil Intervenant rattache contrat et paie. Pas de suppression '
  'physique : retrait = statut retire.';

create index if not exists affectations_individu_intervention_idx
  on public.affectations (aurion_individu_id, intervention_id);
create index if not exists affectations_maj_idx on public.affectations (updated_at, id);
create index if not exists affectations_remplacee_par_idx on public.affectations (remplacee_par);

alter table public.affectations enable row level security;

-- Liste UNIQUE des colonnes suivies de `affectations`.
create or replace function public.affectations_suivi_change(
  o public.affectations,
  n public.affectations
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select row(o.intervention_id, o.aurion_individu_id, o.aurion_intervention_id,
             o.role, o.statut, o.statut_aurion, o.statut_depuis, o.remplacee_par)
         is distinct from
         row(n.intervention_id, n.aurion_individu_id, n.aurion_intervention_id,
             n.role, n.statut, n.statut_aurion, n.statut_depuis, n.remplacee_par);
$$;

comment on function public.affectations_suivi_change(public.affectations, public.affectations) is
  'Vrai si une colonne suivie d''une affectation change. Source unique de la '
  'liste : updated_at et historique en dépendent.';

create or replace function public.affectations_avant_ecriture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- L'identité d'une affectation est (UUID, séance, personne). Changer
    -- la séance ou la personne, c'est une AUTRE affectation : un contrat
    -- rattaché à cet UUID désignerait sinon quelqu'un d'autre.
    if new.id is distinct from old.id
       or new.intervention_id is distinct from old.intervention_id
       or new.aurion_individu_id is distinct from old.aurion_individu_id then
      raise exception 'affectations : id, intervention_id et aurion_individu_id ne changent jamais ; un remplacement crée une nouvelle affectation'
        using errcode = 'P0001';
    end if;

    -- `statut_depuis` est une date de PREUVE (Q10 : heure de transaction
    -- du Planning) : l'écrivain ne la fournit jamais. Elle change avec le
    -- statut, et seulement avec lui ; une valeur fournie est écrasée.
    if new.statut is distinct from old.statut then
      new.statut_depuis := now();
    else
      new.statut_depuis := old.statut_depuis;
    end if;

    new.created_at := old.created_at;
    if public.affectations_suivi_change(old, new) then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  else
    -- INSERT : mêmes règles. Une affectation importée « annulée depuis
    -- trois mois » dans Aurion est datée du jour où le PLANNING l'a su ;
    -- c'est ce que la preuve doit dire (« ce que le Planning savait le
    -- jour J »). Le statut brut d'Aurion reste dans `statut_aurion`, et
    -- sa date de mise à jour dans `interventions.aurion_maj_le`.
    new.created_at := now();
    new.updated_at := now();
    new.statut_depuis := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_affectations_avant_ecriture on public.affectations;
create trigger trg_affectations_avant_ecriture
  before insert or update on public.affectations
  for each row execute function public.affectations_avant_ecriture();

drop trigger if exists trg_affectations_pas_de_suppression on public.affectations;
create trigger trg_affectations_pas_de_suppression
  before delete on public.affectations
  for each row execute function public.refuser_ecriture('une affectation se retire (statut retire), elle ne se supprime pas');

drop policy if exists affectations_select on public.affectations;
create policy affectations_select
  on public.affectations for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );

revoke all on table public.affectations from anon, authenticated;
grant select, insert, update on table public.affectations to service_role;
revoke delete, truncate on table public.affectations from service_role;
grant select on table public.affectations to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Droits des fonctions de ce fichier (AGENTS.md §4 bis).
--    On retire tout à PUBLIC, anon et authenticated, puis on accorde
--    nommément à `service_role` ce dont l'import a besoin (fin du bloc).
-- ─────────────────────────────────────────────────────────────────────
revoke all on function public.interventions_suivi_change(public.interventions, public.interventions) from public;
revoke all on function public.interventions_suivi_change(public.interventions, public.interventions) from anon;
revoke all on function public.interventions_suivi_change(public.interventions, public.interventions) from authenticated;
revoke all on function public.interventions_avant_ecriture() from public;
revoke all on function public.interventions_avant_ecriture() from anon;
revoke all on function public.interventions_avant_ecriture() from authenticated;
revoke all on function public.affectations_suivi_change(public.affectations, public.affectations) from public;
revoke all on function public.affectations_suivi_change(public.affectations, public.affectations) from anon;
revoke all on function public.affectations_suivi_change(public.affectations, public.affectations) from authenticated;
revoke all on function public.affectations_avant_ecriture() from public;
revoke all on function public.affectations_avant_ecriture() from anon;
revoke all on function public.affectations_avant_ecriture() from authenticated;
-- Les déclencheurs BEFORE ne sont pas security definer : ils appellent
-- `*_suivi_change()` avec les droits de l'écrivain, `service_role`.
grant execute on function public.interventions_suivi_change(public.interventions, public.interventions) to service_role;
grant execute on function public.affectations_suivi_change(public.affectations, public.affectations) to service_role;
