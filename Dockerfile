# Build stage
FROM node:20-slim as builder

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias (incluyendo dev para que npm ci funcione correctamente)
RUN npm ci

# Production stage
FROM node:20-slim

WORKDIR /app

# Instalar solo las dependencias de runtime necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* /var/tmp/*

# Configurar Puppeteer para usar Chromium del sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_ARGS=--no-sandbox
ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-deprecation"

# Copiar node_modules desde builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copiar código de la aplicación
COPY src ./src
COPY prompts ./prompts
COPY index.js .

# Crear volúmenes para persistencia
VOLUME ["/app/.wwebjs_auth", "/app/.wwebjs_cache"]

# Exponer puerto (interno 3000, se mapea a 3001 en docker-compose)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

CMD ["node", "index.js"]
