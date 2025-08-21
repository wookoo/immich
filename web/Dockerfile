FROM node:22.16.0-alpine3.20@sha256:2289fb1fba0f4633b08ec47b94a89c7e20b829fc5679f9b7b298eaa2f1ed8b7e

ENV CHOKIDAR_USEPOLLING=true \
  PATH="${PATH}:/usr/src/app/web/bin" 

RUN apk add --no-cache tini bash make

RUN npm i -g corepack@latest \
 && COREPACK_HOME=/root/.corepack corepack enable \
 && COREPACK_HOME=/root/.corepack corepack prepare pnpm@10.14.0 --activate
ENV COREPACK_HOME="/home/node/.corepack" \
    XDG_CACHE_HOME=/tmp/xdg-cache \
    PNPM_STORE_DIR=/tmp/pnpm-store

WORKDIR /usr/src/app/web
EXPOSE 24678 3000
RUN printf '%s\n' \
'#!/bin/sh' \
'set -e' \
': "${HOME:=/home/node}"' \
'CH="${COREPACK_HOME:-$HOME/.corepack}"; CH=$(eval echo "$CH")' \
'for d in "$CH" "$CH/v1" /tmp/xdg-cache /tmp/pnpm-store; do' \
'  [ -d "$d" ] || install -d -m 775 "$d";' \
'  [ -O "$d" ] && chmod -R 775 "$d" || true' \
'done' \
'exec "$@"' \
> /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["tini","--","/usr/local/bin/entrypoint.sh"]