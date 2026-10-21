FROM node:24.22.0-bookworm-slim AS dependencies

WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24.22.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PG_SSL=true

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node app.js index.html styles.css manifest.webmanifest register-sw.js sw.js ./
COPY --chown=node:node assets ./assets
COPY --chown=node:node server ./server

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server/container-start.js", "server/index.js"]

FROM postgres:18.6-bookworm AS backup

WORKDIR /app
RUN groupadd --gid 1000 slink && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin slink
COPY --from=runtime --chown=slink:slink /usr/local/bin/node /usr/local/bin/node
COPY --from=runtime --chown=slink:slink /app/node_modules ./node_modules
COPY --chown=slink:slink package.json ./package.json
COPY --chown=slink:slink server ./server
COPY --chown=slink:slink scripts/postgres-backup.js ./scripts/postgres-backup.js
COPY --chown=slink:slink scripts/postgres-role-check.js ./scripts/postgres-role-check.js
USER slink
ENTRYPOINT ["node", "server/container-start.js"]
CMD ["scripts/postgres-backup.js", "create"]
