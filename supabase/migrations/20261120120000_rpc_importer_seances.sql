-- =====================================================================
-- 20261120120000_rpc_importer_seances.sql — APP-PLANNING, lot 1
--
-- La RPC d'import des séances Aurion : `public.importer_seances`.
--
-- POURQUOI UNE SEULE RPC (ADR-002 D2) : l'historique rattache chaque
-- version à son import par `set_config('planning.import_id', …, true)`.
-- Ce réglage ne vit que le temps d'une TRANSACTION, et chaque requête
-- PostgREST est sa propre transaction. Un `rpc('set_config')` suivi d'un
-- `.upsert()` écrirait donc toutes les versions avec `import_id = NULL`.
-- Ici, tout se fait dans un seul appel, donc une seule transaction : un
-- import est entier ou n'existe pas.
--
-- Appelée par la future Edge Function d'import, sous `service_role`.
--
-- ENTRÉE : un tableau JSON, une ligne par INDIVIDU × séance, comme le
-- favori Aurion de GDC. Vocabulaire Aurion (mesuré chez GDC) :
-- `aurion_intervention_id` = notre AFFECTATION, `aurion_seance_id` = notre
-- SÉANCE (intervention). Champs :
--   aurion_seance_id, aurion_intervention_id, debut, fin (timestamptz),
--   cours_code, cours_intitule, type_activite, modalite, etat_aurion,
--   aurion_maj_le, groupes [{code, intitule, nature}], salle {nom, site},
--   intervenant {aurion_individu_id, nom_affiche} (ou absent),
--   statut_aurion, role.
--
-- CHOIX PROVISOIRES : chaque règle qui n'est pas tranchée porte la marque
-- « PROVISOIRE (Qn) », renvoie à `docs/QUESTIONS.md`, et prend le choix le
-- plus réversible (AGENTS.md §11). Les changer ne demande qu'une nouvelle
-- version de cette fonction (`create or replace`), sans migration de données.
--
-- MIGRATION ADDITIVE : une fonction, ses droits, ses assertions. Aucun
-- objet existant n'est modifié. Aucun type ni aucune table créés : le
-- projet hébergé porte un déclencheur d'événement Supabase (`ensure_rls`)
-- absent de l'image de répétition, et on ne lui donne rien à traiter.
-- =====================================================================

create or replace function public.importer_seances(
  p_lignes jsonb,
  p_declenchement text default 'automatique',
  p_lance_par uuid default null
) returns uuid
language plpgsql
-- security INVOKER : la fonction écrit avec les droits de l'appelant
-- (`service_role`), accordés nommément dans les migrations du lot. Un
-- definer contournerait ces droits, et toute erreur de garde ici
-- deviendrait une écriture possible pour qui obtiendrait `execute`.
security invoker
set search_path = ''
as $$
declare
  v_import uuid;
  v_elem jsonb;
  v_rang bigint;
  v_motif text;
  v_seance text;
  v_debut timestamptz;
  v_fin timestamptz;
  v_maj timestamptz;
  v_interv jsonb;
  v_individu text;
  v_aff_code text;
  v_role text;
  v_groupes jsonb;
  -- Lignes valides, normalisées. Un tableau `jsonb[]` et non un `jsonb` :
  -- l'ajout en fin de tableau plpgsql se fait sur place, alors que `||`
  -- sur un `jsonb` recopie tout le tableau à chaque ligne (quadratique
  -- sur les ~5 000 lignes d'un import réel).
  v_valides jsonb[] := '{}';
  v_valides_json jsonb;
  -- Séances reçues (lignes valides), séances touchées par une ligne
  -- invalide, séances connues AVANT cet import.
  v_recues text[];
  v_incompletes text[] := '{}';
  v_connues text[];
  v_plage_debut timestamptz;
  v_plage_fin timestamptz;
  v_aff record;
  v_existante public.affectations%rowtype;
  v_statut text;
  v_aff_vues uuid[] := '{}';
  v_retirees uuid[];
  v_nb_nouvelles integer;
  v_nb_modifiees integer;
  v_nb_anomalies integer;
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'importer_seances : p_lignes doit être un tableau JSON'
      using errcode = '22023';
  end if;

  -- ── 1. Un seul import à la fois ─────────────────────────────────────
  -- Verrou consultatif de TRANSACTION, essayé sans attendre : un import
  -- concurrent est refusé tout de suite avec un message clair, au lieu
  -- d'attendre la fin du premier puis de recomparer Aurion à un état
  -- déjà changé. Le verrou tombe seul à la fin de la transaction.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('planning.importer_seances')) then
    raise exception 'Import Aurion refusé : un autre import est en cours.'
      using errcode = '55P03',
            hint = 'Relancer quand l''import en cours sera terminé.';
  end if;

  -- L'index unique « un seul en cours » (20261120090300) refuse aussi une
  -- ligne `en_cours` laissée par un autre chemin. Même message, même code.
  begin
    insert into public.imports_aurion (declenchement, lance_par, statut)
    values (p_declenchement, p_lance_par, 'en_cours')
    returning id into v_import;
  exception when unique_violation then
    raise exception 'Import Aurion refusé : un autre import est en cours.'
      using errcode = '55P03',
            hint = 'Si aucun import ne tourne, passer la ligne en_cours de imports_aurion à echec.';
  end;

  -- ── 2. Rattacher toutes les versions de l'historique à cet import ───
  perform pg_catalog.set_config('planning.import_id', v_import::text, true);

  -- ── 3. Valider et normaliser chaque ligne ───────────────────────────
  -- Une ligne invalide est IGNORÉE et produit une anomalie
  -- `donnee_invalide` : écrire une donnée douteuse est moins réversible
  -- que ne pas l'écrire. PROVISOIRE (Q13) pour le cas « code Aurion
  -- d'affectation manquant ».
  for v_elem, v_rang in
    select e, o from pg_catalog.jsonb_array_elements(p_lignes) with ordinality as t (e, o)
  loop
    v_motif := null;
    v_debut := null; v_fin := null; v_maj := null;
    v_seance := nullif(btrim(v_elem ->> 'aurion_seance_id'), '');

    if jsonb_typeof(v_elem) <> 'object' then
      v_motif := 'ligne qui n''est pas un objet JSON';
    elsif v_seance is null then
      v_motif := 'aurion_seance_id manquant';
    else
      begin
        v_debut := (v_elem ->> 'debut')::timestamptz;
        v_fin := (v_elem ->> 'fin')::timestamptz;
        v_maj := (v_elem ->> 'aurion_maj_le')::timestamptz;
      exception when others then
        v_motif := 'date illisible : ' || sqlerrm;
      end;
      if v_motif is null then
        if v_debut is null or v_fin is null then
          v_motif := 'debut ou fin manquant';
        elsif v_fin <= v_debut then
          v_motif := 'fin antérieure ou égale au début';
        end if;
      end if;
    end if;

    -- Intervenant : absent = séance sans intervenant (valide). Présent, il
    -- lui faut l'identifiant de la personne ET le code de l'affectation.
    v_interv := case when jsonb_typeof(v_elem -> 'intervenant') = 'object'
                     then v_elem -> 'intervenant' end;
    v_individu := nullif(btrim(v_interv ->> 'aurion_individu_id'), '');
    v_aff_code := nullif(btrim(v_elem ->> 'aurion_intervention_id'), '');
    if v_motif is null and v_interv is not null then
      if v_individu is null then
        v_motif := 'intervenant sans aurion_individu_id';
      elsif v_aff_code is null then
        -- PROVISOIRE (Q13) : sans code d'affectation, la ligne est ignorée.
        v_motif := 'intervenant sans aurion_intervention_id';
      end if;
    end if;

    if v_motif is not null then
      insert into public.anomalies_import (import_id, aurion_seance_id, type, detail)
      values (v_import, v_seance, 'donnee_invalide', 'ligne ' || v_rang || ' : ' || v_motif);
      -- Une séance touchée par une ligne invalide est « incomplète » : on
      -- ne retire ni elle ni ses affectations sur la foi de cet import.
      if v_seance is not null then
        v_incompletes := v_incompletes || v_seance;
      end if;
      continue;
    end if;

    -- PROVISOIRE (Q11) : un rôle hors des quatre codes est ignoré (le rôle
    -- existant est gardé), plutôt que de rejeter la ligne.
    v_role := case when v_elem ->> 'role' in ('principal', 'co_intervenant', 'soutien_interne', 'remplacant')
                   then v_elem ->> 'role' end;
    -- Seuls les groupes qui sont des objets avec un code sont gardés : un
    -- élément mal formé ferait échouer `jsonb_to_recordset`, donc l'import
    -- entier, pour une seule ligne. Le code passe par `btrim`, comme les
    -- autres identifiants : « A » et « A␠» sont le même groupe, sinon un
    -- espace de saisie dans Aurion créerait un second groupe.
    select coalesce(jsonb_agg(pg_catalog.jsonb_set(g, '{code}', pg_catalog.to_jsonb(btrim(g ->> 'code')))),
                    '[]'::jsonb) into v_groupes
      from pg_catalog.jsonb_array_elements(
             case when jsonb_typeof(v_elem -> 'groupes') = 'array'
                  then v_elem -> 'groupes' else '[]'::jsonb end) as t (g)
     where jsonb_typeof(g) = 'object'
       and nullif(btrim(g ->> 'code'), '') is not null;

    v_valides := v_valides || jsonb_build_object(
      'rang', v_rang,
      'aurion_seance_id', v_seance,
      'aurion_intervention_id', case when v_individu is not null then v_aff_code end,
      'debut', v_debut,
      'fin', v_fin,
      'cours_code', v_elem ->> 'cours_code',
      'cours_intitule', v_elem ->> 'cours_intitule',
      'type_activite', v_elem ->> 'type_activite',
      'modalite', v_elem ->> 'modalite',
      'etat_aurion', v_elem ->> 'etat_aurion',
      'aurion_maj_le', v_maj,
      'groupes', v_groupes,
      'salle_nom', nullif(btrim(v_elem -> 'salle' ->> 'nom'), ''),
      'salle_site', v_elem -> 'salle' ->> 'site',
      'aurion_individu_id', v_individu,
      'nom_affiche', v_interv ->> 'nom_affiche',
      'statut_aurion', v_elem ->> 'statut_aurion',
      'role', v_role
    );
  end loop;

  v_valides_json := pg_catalog.to_jsonb(v_valides);

  select coalesce(array_agg(distinct l.aurion_seance_id), '{}'),
         min(l.debut), max(l.fin)
    into v_recues, v_plage_debut, v_plage_fin
    from pg_catalog.jsonb_to_recordset(v_valides_json)
         as l (aurion_seance_id text, debut timestamptz, fin timestamptz);

  -- ── 4. Référentiels ─────────────────────────────────────────────────
  -- Valeurs Aurion qui manquent : on garde l'existant (`coalesce`) plutôt
  -- que d'effacer. Dédoublonnage obligatoire : un `on conflict do update`
  -- refuse de toucher deux fois la même ligne dans une instruction.
  insert into public.promotions_groupes (aurion_code, intitule, nature)
  select distinct on (g.code) g.code, g.intitule,
         case when g.nature in ('promotion', 'groupe') then g.nature end
    from pg_catalog.jsonb_to_recordset(v_valides_json) as l (rang bigint, groupes jsonb)
    cross join lateral pg_catalog.jsonb_to_recordset(l.groupes) as g (code text, intitule text, nature text)
   where nullif(btrim(g.code), '') is not null
   order by g.code, l.rang desc
  on conflict (aurion_code) do update
     set intitule = coalesce(excluded.intitule, promotions_groupes.intitule),
         nature = coalesce(excluded.nature, promotions_groupes.nature);

  -- Salles construites depuis les séances (décision du plan du 2026-11-20, tranchée ; sans lien avec Q6 de docs/QUESTIONS.md).
  insert into public.salles (nom, site)
  select distinct on (l.salle_nom) l.salle_nom, l.salle_site
    from pg_catalog.jsonb_to_recordset(v_valides_json) as l (rang bigint, salle_nom text, salle_site text)
   where l.salle_nom is not null
   order by l.salle_nom, l.rang desc
  on conflict (nom) do update
     set site = coalesce(excluded.site, salles.site);

  insert into public.intervenants_aurion (aurion_individu_id, nom_affiche)
  select distinct on (l.aurion_individu_id) l.aurion_individu_id, l.nom_affiche
    from pg_catalog.jsonb_to_recordset(v_valides_json) as l (rang bigint, aurion_individu_id text, nom_affiche text)
   where l.aurion_individu_id is not null
   order by l.aurion_individu_id, l.rang desc
  on conflict (aurion_individu_id) do update
     set nom_affiche = coalesce(excluded.nom_affiche, intervenants_aurion.nom_affiche);

  -- ── 5. Séances ──────────────────────────────────────────────────────
  -- Séances connues AVANT cet import : sert à « nouvelle » et à la règle
  -- `ajoute` des affectations.
  select coalesce(array_agg(i.aurion_seance_id), '{}') into v_connues
    from public.interventions i
   where i.aurion_seance_id = any (v_recues);

  -- Une séance par `aurion_seance_id` : la DERNIÈRE ligne reçue fait foi.
  -- PROVISOIRE (Q9) : une séance retirée qui réapparaît est réactivée
  -- (`statut = 'active'`, le déclencheur efface `retiree_le`). Le retrait
  -- reste lisible dans l'historique.
  insert into public.interventions (
    aurion_seance_id, debut, fin, cours_code, cours_intitule, type_activite,
    modalite, salle_id, salle_nom_aurion, etat_aurion, statut, aurion_maj_le,
    dernier_import_id
  )
  select distinct on (l.aurion_seance_id)
         l.aurion_seance_id, l.debut, l.fin, l.cours_code, l.cours_intitule, l.type_activite,
         l.modalite, s.id, l.salle_nom, l.etat_aurion, 'active', l.aurion_maj_le,
         v_import
    from pg_catalog.jsonb_to_recordset(v_valides_json) as l (
           rang bigint, aurion_seance_id text, debut timestamptz, fin timestamptz,
           cours_code text, cours_intitule text, type_activite text, modalite text,
           etat_aurion text, aurion_maj_le timestamptz, salle_nom text)
    left join public.salles s on s.nom = l.salle_nom
   order by l.aurion_seance_id, l.rang desc
  on conflict (aurion_seance_id) do update
     set debut = excluded.debut,
         fin = excluded.fin,
         cours_code = excluded.cours_code,
         cours_intitule = excluded.cours_intitule,
         type_activite = excluded.type_activite,
         modalite = excluded.modalite,
         salle_id = excluded.salle_id,
         salle_nom_aurion = excluded.salle_nom_aurion,
         etat_aurion = excluded.etat_aurion,
         statut = 'active',
         aurion_maj_le = excluded.aurion_maj_le,
         dernier_import_id = excluded.dernier_import_id;

  -- ── 6. Liens séance ↔ groupes : remplacés par l'ensemble reçu ───────
  -- L'ensemble d'une séance = l'union des groupes de toutes ses lignes
  -- valides. Pas d'historique des groupes au lot 1 (dette connue).
  -- Séances incomplètes exclues : on n'efface pas un lien sur la foi d'un
  -- import qui a perdu une de leurs lignes.
  with recus as (
    select distinct i.id as intervention_id, g.id as groupe_id
      from pg_catalog.jsonb_to_recordset(v_valides_json) as l (aurion_seance_id text, groupes jsonb)
      join public.interventions i on i.aurion_seance_id = l.aurion_seance_id
      cross join lateral pg_catalog.jsonb_to_recordset(l.groupes) as x (code text)
      join public.promotions_groupes g on g.aurion_code = x.code
  )
  delete from public.intervention_groupes ig
   using public.interventions i
   where ig.intervention_id = i.id
     and i.aurion_seance_id = any (v_recues)
     and not (i.aurion_seance_id = any (v_incompletes))
     and not exists (select 1 from recus r
                      where r.intervention_id = ig.intervention_id and r.groupe_id = ig.groupe_id);

  insert into public.intervention_groupes (intervention_id, groupe_id)
  select distinct i.id, g.id
    from pg_catalog.jsonb_to_recordset(v_valides_json) as l (aurion_seance_id text, groupes jsonb)
    join public.interventions i on i.aurion_seance_id = l.aurion_seance_id
    cross join lateral pg_catalog.jsonb_to_recordset(l.groupes) as x (code text)
    join public.promotions_groupes g on g.aurion_code = x.code
  on conflict do nothing;

  -- ── 7. Affectations ─────────────────────────────────────────────────
  -- Une ligne par (séance, personne) : la PREMIÈRE reçue fait foi.
  -- PROVISOIRE (Q13) : deux lignes de la même séance pour la même personne
  -- avec des codes Aurion d'affectation DIFFÉRENTS sont une incohérence
  -- d'Aurion. On garde la première, et chaque ligne suivante au code
  -- différent est signalée (`donnee_invalide`). « La première » rend le
  -- résultat déterministe, quel que soit l'ordre de traitement. Une simple
  -- répétition (même code) est dédoublonnée sans anomalie. La séance n'est
  -- PAS marquée incomplète : la personne y est bien couverte par la ligne
  -- gardée, rien n'y manque.
  insert into public.anomalies_import (import_id, aurion_seance_id, type, detail)
  select v_import, l.aurion_seance_id, 'donnee_invalide',
         'ligne ' || l.rang || ' : même séance et même personne qu''une ligne précédente, '
         || 'avec un autre aurion_intervention_id (' || l.aurion_intervention_id || ') ; ligne ignorée'
    from pg_catalog.jsonb_to_recordset(v_valides_json) as l (
           rang bigint, aurion_seance_id text, aurion_individu_id text, aurion_intervention_id text)
   where l.aurion_individu_id is not null
     and exists (
       select 1 from pg_catalog.jsonb_to_recordset(v_valides_json) as p (
                       rang bigint, aurion_seance_id text, aurion_individu_id text, aurion_intervention_id text)
        where p.aurion_seance_id = l.aurion_seance_id
          and p.aurion_individu_id = l.aurion_individu_id
          and p.rang < l.rang
          and p.aurion_intervention_id <> l.aurion_intervention_id);

  for v_aff in
    select distinct on (l.aurion_seance_id, l.aurion_individu_id)
           l.aurion_seance_id, l.aurion_individu_id, l.aurion_intervention_id,
           l.statut_aurion, l.role, i.id as intervention_id
      from pg_catalog.jsonb_to_recordset(v_valides_json) as l (
             rang bigint, aurion_seance_id text, aurion_individu_id text,
             aurion_intervention_id text, statut_aurion text, role text)
      join public.interventions i on i.aurion_seance_id = l.aurion_seance_id
     where l.aurion_individu_id is not null
     order by l.aurion_seance_id, l.aurion_individu_id, l.rang
  loop
    -- Retrouver l'affectation : d'abord par son code Aurion, sinon par
    -- (séance, personne). PROVISOIRE (Q13) : un nouveau code Aurion pour la
    -- même séance et la même personne garde l'UUID du Planning (le contrat
    -- de GDC y est rattaché) et met le code à jour.
    select a.* into v_existante
      from public.affectations a
     where a.aurion_intervention_id = v_aff.aurion_intervention_id;
    if not found then
      select a.* into v_existante
        from public.affectations a
       where a.intervention_id = v_aff.intervention_id
         and a.aurion_individu_id = v_aff.aurion_individu_id;
    end if;

    -- PROVISOIRE (Q6) : seul « annulé » se traduit (en `annule`). « réalisé »
    -- et les autres valeurs ne changent pas le statut du Planning ; le
    -- texte brut reste dans `statut_aurion`.
    v_statut := case when lower(btrim(coalesce(v_aff.statut_aurion, '')))
                          in ('annulé', 'annule', 'annulée', 'annulee')
                     then 'annule' end;

    if v_existante.id is not null then
      if v_existante.intervention_id <> v_aff.intervention_id
         or v_existante.aurion_individu_id <> v_aff.aurion_individu_id then
        -- PROVISOIRE (Q13) : un code Aurion d'affectation qui change de
        -- séance ou de personne désignerait quelqu'un d'autre sous le même
        -- UUID. Ligne ignorée, anomalie, séance incomplète.
        insert into public.anomalies_import (import_id, intervention_id, aurion_seance_id, type, detail)
        values (v_import, v_aff.intervention_id, v_aff.aurion_seance_id, 'donnee_invalide',
                'aurion_intervention_id ' || v_aff.aurion_intervention_id
                || ' déjà rattaché à une autre séance ou une autre personne');
        v_incompletes := v_incompletes || v_aff.aurion_seance_id;
        v_aff_vues := v_aff_vues || v_existante.id;
        continue;
      end if;

      update public.affectations a
         set aurion_intervention_id = v_aff.aurion_intervention_id,
             role = coalesce(v_aff.role, a.role),
             statut_aurion = v_aff.statut_aurion,
             -- PROVISOIRE (Q8) : une affectation annulée ou retirée qui
             -- revient (non annulée) passe à `ajoute`. `remplace` n'est
             -- jamais posé par l'import (décision du plan sur `remplacee_par` : Aurion ne donne pas
             -- le lien) et reste tel quel.
             statut = coalesce(v_statut,
                               case when a.statut in ('annule', 'retire') then 'ajoute'
                                    else a.statut end)
       where a.id = v_existante.id;
      v_aff_vues := v_aff_vues || v_existante.id;
    else
      -- PROVISOIRE (Q8) : nouvelle affectation sur une séance connue AVANT
      -- cet import = `ajoute` ; sur une séance nouvelle = `prevu`.
      insert into public.affectations (
        intervention_id, aurion_individu_id, aurion_intervention_id,
        role, statut, statut_aurion
      ) values (
        v_aff.intervention_id, v_aff.aurion_individu_id, v_aff.aurion_intervention_id,
        v_aff.role,
        coalesce(v_statut,
                 case when v_aff.aurion_seance_id = any (v_connues) then 'ajoute' else 'prevu' end),
        v_aff.statut_aurion
      )
      returning id into v_existante.id;
      v_aff_vues := v_aff_vues || v_existante.id;
    end if;
    v_existante := null;
  end loop;

  -- ── 8. Retraits ─────────────────────────────────────────────────────
  -- Affectation absente d'une séance REÇUE (et complète) → `retire`.
  update public.affectations a
     set statut = 'retire'
    from public.interventions i
   where a.intervention_id = i.id
     and i.aurion_seance_id = any (v_recues)
     and not (i.aurion_seance_id = any (v_incompletes))
     and a.statut <> 'retire'
     and not (a.id = any (v_aff_vues));

  -- Séance connue, active, ABSENTE de l'import, dont le début tombe dans
  -- la plage couverte par les lignes valides reçues → `retiree`.
  -- PROVISOIRE (Q7) : la plage est [min(debut), max(fin)] des lignes
  -- valides. Hors plage, l'absence ne prouve rien (le favori Aurion ne
  -- couvre peut-être qu'une période). Import sans ligne valide : aucun
  -- retrait. Une séance seulement nommée par une ligne invalide n'est pas
  -- retirée. PROVISOIRE (Q14) : les affectations d'une séance retirée ne
  -- changent pas.
  with retirees as (
    update public.interventions i
       set statut = 'retiree'
     where i.statut = 'active'
       and i.aurion_seance_id is not null
       and v_plage_debut is not null
       and i.debut >= v_plage_debut
       and i.debut <= v_plage_fin
       and not (i.aurion_seance_id = any (v_recues))
       and not (i.aurion_seance_id = any (v_incompletes))
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into v_retirees from retirees;

  -- ── 9. Anomalie « séance sans intervenant » ─────────────────────────
  -- Une par séance reçue dont AUCUNE ligne valide ne porte d'intervenant.
  -- PROVISOIRE (Q12) : « Salle inconnue » et « Intervenant sans fiche » ne
  -- sont pas levées ici (salles construites depuis les séances ; la fiche
  -- est chez GDC, lue plus tard par son api_v1).
  insert into public.anomalies_import (import_id, intervention_id, aurion_seance_id, type, detail)
  select v_import, i.id, i.aurion_seance_id, 'seance_sans_intervenant',
         'aucune ligne de cette séance ne porte d''intervenant'
    from public.interventions i
   where i.aurion_seance_id = any (v_recues)
     and not exists (
       select 1 from pg_catalog.jsonb_to_recordset(v_valides_json)
                     as l (aurion_seance_id text, aurion_individu_id text)
        where l.aurion_seance_id = i.aurion_seance_id and l.aurion_individu_id is not null);

  -- ── 10. Compteurs, lus dans l'historique écrit par cet import ───────
  -- PROVISOIRE (Q10) : les compteurs comptent des SÉANCES (`nb_lues` compte
  -- les lignes reçues). « Modifiée » = séance qui existait déjà, a reçu au
  -- moins une version écrite par cet import (séance ou une de ses
  -- affectations), et n'a pas été retirée par lui. Lire l'historique, et
  -- non comparer à la main, garantit qu'une mise à jour sans changement ne
  -- compte pas : le déclencheur n'a rien écrit.
  select count(*) into v_nb_nouvelles
    from public.interventions_historique h
   where h.import_id = v_import and h.operation = 'insert';

  select count(distinct x.intervention_id) into v_nb_modifiees
    from (
      select h.intervention_id from public.interventions_historique h
       where h.import_id = v_import and h.operation = 'update'
      union
      select h.intervention_id from public.affectations_historique h
       where h.import_id = v_import
    ) x
   where not exists (select 1 from public.interventions_historique n
                      where n.intervention_id = x.intervention_id
                        and n.import_id = v_import and n.operation = 'insert')
     and not (x.intervention_id = any (v_retirees));

  select count(*) into v_nb_anomalies
    from public.anomalies_import an where an.import_id = v_import;

  update public.imports_aurion
     set statut = case when v_nb_anomalies > 0 then 'reussi_avec_anomalies' else 'reussi' end,
         fin = now(),
         nb_lues = jsonb_array_length(p_lignes),
         nb_nouvelles = v_nb_nouvelles,
         nb_modifiees = v_nb_modifiees,
         nb_retirees = cardinality(v_retirees),
         nb_anomalies = v_nb_anomalies
   where id = v_import;

  return v_import;
end;
$$;

comment on function public.importer_seances(jsonb, text, uuid) is
  'Import Aurion en une transaction : journal imports_aurion, référentiels, '
  'séances, groupes, affectations, retraits, anomalies, compteurs. Rattache '
  'chaque version d''historique à l''import (planning.import_id). Un seul '
  'import à la fois (55P03 sinon). Réimporter les mêmes lignes ne change '
  'rien. Règles provisoires : docs/QUESTIONS.md Q6 à Q14. service_role seul.';

-- ─────────────────────────────────────────────────────────────────────
-- Droits (AGENTS.md §4 bis) : retirés NOMMÉMENT à PUBLIC, anon et
-- authenticated — `revoke … from public` ne retire pas le grant nominatif
-- posé par les privilèges par défaut. Accordé nommément à service_role,
-- sans compter sur ces privilèges par défaut.
-- ─────────────────────────────────────────────────────────────────────
revoke all on function public.importer_seances(jsonb, text, uuid) from public;
revoke all on function public.importer_seances(jsonb, text, uuid) from anon;
revoke all on function public.importer_seances(jsonb, text, uuid) from authenticated;
grant execute on function public.importer_seances(jsonb, text, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────
-- Assertions propres à cette fonction. 20261120090700 est déjà appliqué
-- et ne se rejoue pas : il ne verra jamais cette fonction. Ce bloc la
-- vérifie au moment où elle arrive, sur la base réelle.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  v_f constant regprocedure := 'public.importer_seances(jsonb, text, uuid)'::regprocedure;
begin
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_f) then
    raise exception 'Assertion : importer_seances doit être security invoker';
  end if;
  if has_function_privilege('anon', v_f, 'execute')
     or has_function_privilege('authenticated', v_f, 'execute') then
    raise exception 'Assertion : anon ou authenticated peut exécuter importer_seances';
  end if;
  if not has_function_privilege('service_role', v_f, 'execute') then
    raise exception 'Assertion : service_role ne peut pas exécuter importer_seances';
  end if;
  -- Ce que la fonction écrit sous les droits de son appelant : si l'un
  -- manque, l'import échouerait en production sur un 42501.
  if not (has_table_privilege('service_role', 'public.intervention_groupes', 'delete')
          and has_table_privilege('service_role', 'public.anomalies_import', 'insert')
          and has_table_privilege('service_role', 'public.imports_aurion', 'update')
          and has_table_privilege('service_role', 'public.interventions', 'update')
          and has_table_privilege('service_role', 'public.affectations', 'update')) then
    raise exception 'Assertion : service_role n''a pas les droits d''écriture de l''import';
  end if;
end;
$$;
