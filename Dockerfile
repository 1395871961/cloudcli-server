FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y \
    python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts && node scripts/fix-node-pty.js 2>/dev/null || true

COPY . .
RUN npm run build

# --- runtime ---
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && node scripts/fix-node-pty.js 2>/dev/null || true

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY scripts ./scripts
COPY server ./server
COPY shared ./shared

ENV NODE_ENV=production
ENV SERVER_PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

VOLUME ["/data"]
ENV DATABASE_PATH=/data/auth.db

CMD ["node", "dist-server/server/index.js"]
