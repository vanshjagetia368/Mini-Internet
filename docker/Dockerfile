# ─── Base image ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
WORKDIR /app

# ─── Dependencies stage ───────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY simulator/package.json ./simulator/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --workspaces

# ─── Build simulator ─────────────────────────────────────────────────────────
FROM deps AS build-simulator
COPY simulator/ ./simulator/
RUN npm run build --workspace=simulator

# ─── Build server ─────────────────────────────────────────────────────────────
FROM build-simulator AS build-server
COPY server/ ./server/
RUN npm run build --workspace=server

# ─── Production server image ──────────────────────────────────────────────────
FROM node:24-alpine AS server-prod
WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build-simulator /app/simulator/dist ./simulator/dist
COPY --from=build-simulator /app/simulator/package.json ./simulator/package.json
COPY --from=build-server /app/server/dist ./server/dist
COPY --from=build-server /app/server/package.json ./server/package.json

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
