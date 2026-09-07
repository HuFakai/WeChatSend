FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY web/backend/package.json web/backend/package.json
COPY web/frontend/package.json web/frontend/package.json
RUN npm ci

COPY web/backend web/backend
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" npm run db:generate \
  && npm run build -w @wechatsend/backend

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/web/backend web/backend
COPY --from=build --chown=node:node /app/web/frontend/package.json web/frontend/package.json

USER node
CMD ["node", "web/backend/dist/src/main.js"]
