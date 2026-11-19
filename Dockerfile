# syntax=docker/dockerfile:1.7

# ─── Étage de build ─────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# git : requis au build pour injecter la version (SHA + n° de PR) —
# `vite.config.ts` lit `git rev-parse` / `git log`. Étage de build uniquement :
# l'image servie est nginx et ne copie que `dist/`.
RUN apk add --no-cache git

# Dépendances d'abord, pour un meilleur cache de couches.
COPY package.json package-lock.json ./
RUN npm ci

# Vite lit les variables VITE_* AU MOMENT DU BUILD et les inline dans le
# bundle. À passer en --build-arg depuis la plateforme de déploiement.
# ⚠️ Clé anon PUBLIQUE uniquement — JAMAIS la service_role : elle finirait
# lisible dans le JavaScript livré au navigateur.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . .
RUN npm run build

# ─── Étage d'exécution ──────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
