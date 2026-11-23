# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.server.json ./
COPY src ./src
COPY server ./server
COPY tests/server ./tests/server
RUN npm run test:server && npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    MUSIC_DATA_DIR=/data
WORKDIR /app
RUN addgroup -S aria \
  && adduser -S -G aria aria \
  && mkdir -p /data \
  && chown aria:aria /data
COPY --from=build --chown=aria:aria /app/dist ./dist
COPY --from=build --chown=aria:aria /app/dist-server ./dist-server
COPY --chown=aria:aria package.json ./
USER aria
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"
CMD ["sh", "-c", "export REQUIRE_AUTH=\"${REQUIRE_AUTH:-1}\"; exec node dist-server/index.js"]
