FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY web/backend/package.json web/backend/package.json
COPY web/frontend/package.json web/frontend/package.json
RUN npm ci

COPY web/frontend web/frontend
RUN npm run build -w @wechatsend/frontend

FROM nginx:1.29-alpine
COPY web/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/frontend/dist /usr/share/nginx/html
EXPOSE 80
