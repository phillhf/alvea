# ============================================================
# Betten & Entlassreinigung – Docker Image
# Multi-Stage Build: Frontend + Backend in einem Container
# ============================================================

# ---- Stage 1: Frontend bauen ----
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Backend bauen (inkl. native better-sqlite3) ----
FROM node:24-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ---- Stage 3: Laufzeit-Image ----
FROM node:24-alpine AS runtime
RUN apk add --no-cache tini

# Struktur nachbauen wie im normalen Deployment: betten/backend + betten/frontend
WORKDIR /app/betten/backend

# Nur Production-Dependencies des Backends
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Gebaute Artefakte aus den vorherigen Stages
COPY --from=backend-build  /app/backend/dist  ./dist
COPY --from=frontend-build /app/frontend/dist  /app/betten/frontend/dist

# init.sql liegt laut Projektstruktur unter betten-pkg/db/ (von dist/scripts/ aus: ../../../db/)
COPY db/ /app/betten/db/

# Datenverzeichnisse (Volumes werden hier eingehängt)
RUN mkdir -p /app/betten/backend/data /app/betten/backend/uploads /app/betten/backend/logs && \
    addgroup -S betten && adduser -S betten -G betten && \
    chown -R betten:betten /app/betten

USER betten

ENV NODE_ENV=production
ENV PORT=37843
ENV HOST=0.0.0.0
ENV DB_FILE=/app/betten/backend/data/bettenaufbereitung.sqlite
ENV UPLOAD_DIR=/app/betten/backend/uploads

EXPOSE 37843

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node dist/scripts/init-db.js && node dist/server.js"]
