# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend + serve frontend build ───────────────────────────────────
FROM node:20-slim

# Herramientas para compilar better-sqlite3 (native module)
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias del backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=optional

# Copiar backend
COPY backend/ ./backend/

# Copiar el build del frontend generado en Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Directorio de datos (será sobreescrito por el volumen persistente en Fly.io)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/ventas.db

EXPOSE 3001

CMD ["node", "backend/index.js"]
