FROM node:22.16.0-alpine3.20@sha256:2289fb1fba0f4633b08ec47b94a89c7e20b829fc5679f9b7b298eaa2f1ed8b7e
ENV CHOKIDAR_USEPOLLING=true \
    PATH="${PATH}:/usr/src/app/web/bin" \
    XDG_CACHE_HOME=/tmp/xdg-cache \
    PNPM_STORE_DIR=/buildcache/pnpm-store

RUN apk add --no-cache tini bash make && npm i -g pnpm@10.14.0 && mkdir -p /buildcache/pnpm-store /tmp/xdg-cache
WORKDIR /usr/src/app/web
EXPOSE 24678 3000
ENTRYPOINT ["tini", "--", "/bin/bash", "-c"]