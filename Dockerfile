# ─────────────────────────────────────────────────────────────────
# Stage 1: Build React frontend
# ─────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

# Instalar dependencias primero (cache layer)
COPY frontend/package*.json ./
RUN npm ci

# Copiar fuentes y construir
COPY frontend/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 2: Python runtime (FastAPI + uvicorn)
# ─────────────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Instalar dependencias Python
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar backend
COPY backend/ ./backend/

# Copiar el build de React desde el stage anterior
COPY --from=frontend-build /app/frontend/dist ./dist

# Cloud Run requiere 8080
EXPOSE 8080

# Credenciales montadas como volumen en dev, como Secret en Cloud Run
# ENV GOOGLE_APPLICATION_CREDENTIALS configurado externamente
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
