# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json tsconfig.json ./

# Install ALL deps (including dev) for build
RUN npm install --ignore-scripts

# Copy source and compile
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production deps only
RUN npm install --omit=dev --ignore-scripts && \
    # Remove npm cache to keep image minimal
    npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Expose the application port (matches BACKEND_PORT default)
EXPOSE 3000

# Use node directly — no process manager needed for Cloud Run
CMD ["node", "dist/server.js"]
