// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (client/erreurEdge.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * Lecture du message d'erreur **structuré** rendu par une Edge Function —
 * côté navigateur.
 *
 * LE PROBLÈME QU'IL RÈGLE. Sur un statut non-2xx,
 * `supabase.functions.invoke` lève une `FunctionsHttpError` dont le
 * `.message` est **générique** (« Edge Function returned a non-2xx status
 * code »). Le vrai message métier est dans le **corps** de la réponse, exposé
 * par `error.context` — un objet `Response` **non encore lu**. Sans ce
 * lecteur, l'utilisateur voit une phrase en anglais qui ne dit rien, alors que
 * le serveur avait rédigé la bonne.
 *
 * ⚠️ CE MODULE NE DÉDUPLIQUE RIEN, ET IL FAUT LE DIRE. Il n'existait qu'en
 * **un seul exemplaire** dans tout le parc (`APP-FACTU/src/lib/edge/`, 38
 * lignes). APP-FIX, APP-MSP et APP-GDC lisent leurs erreurs autrement. Son
 * entrée dans le socle ne retire donc aucune copie : elle supprime **une
 * inversion de dépendance chez chaque adoptant** du sous-chemin `m365-auth`,
 * qui exigeait jusqu'ici qu'on lui injecte ce lecteur faute de sous-chemin qui
 * l'héberge. C'est de l'ergonomie de socle, pas de la mutualisation.
 *
 * ⭐ POURQUOI IL NE LÈVE JAMAIS. Il est appelé depuis un `catch`. Une erreur
 * levée en lisant une erreur masquerait la première, et le message affiché
 * serait pire que celui qu'on cherchait à améliorer. En cas de doute il rend
 * `null`, et l'appelant retombe sur son libellé générique.
 *
 * ⭐ POURQUOI `clone()`. Le corps d'une `Response` ne se lit **qu'une fois**.
 * Sans le clone, ce lecteur consommerait le corps et le priverait de tout
 * autre lecteur — un intercepteur, un journal, une seconde tentative.
 */

/** Forme du corps d'erreur rendu par les Edge Functions du parc. */
type CorpsErreur = { message?: unknown };

export async function messageErreurEdge(
  err: unknown,
): Promise<string | null> {
  const contexte = (err as { context?: unknown } | null)?.context;
  // Le contexte doit ressembler à une Response : présence de `.json`.
  if (
    !contexte ||
    typeof (contexte as { json?: unknown }).json !== 'function'
  ) {
    return null;
  }
  try {
    const reponse = contexte as Response;
    const corps = (await reponse.clone().json()) as CorpsErreur;
    const message = corps?.message;
    return typeof message === 'string' && message.trim() !== ''
      ? message
      : null;
  } catch {
    // Corps non-JSON, déjà lu, ou illisible : repli sur l'appelant.
    return null;
  }
}
