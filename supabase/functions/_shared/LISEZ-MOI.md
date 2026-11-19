# `_shared` — utilitaires communs aux Edge Functions

Tout module utilisé par plus d'une Edge Function vit ici, jamais recopié.

## Ce qui NE doit PAS atterrir ici

Les utilitaires du socle commun du parc — CORS, garde d'authentification,
frappe de JWT membre, validation d'entrée, audit — viennent du paquet
`@it-unify/edge-kit`, pas d'une copie.

Motif : ces fichiers ont été mesurés recopiés à l'identique entre APP-FIX,
APP-FACTU et APP-MSP, à des commentaires près. Voir `APP-TEMPLATE`
ADR-001 §1.3.

Si vous vous apprêtez à coller ici un fichier venu d'un autre dépôt du parc,
c'est le signal qu'il appartient au paquet.
