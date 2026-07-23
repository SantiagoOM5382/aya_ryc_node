FROM node:20-slim

WORKDIR /app

# Instalar dependencias para Chromium en Debian
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Configurar Puppeteer para usar Chromium del sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Enable sandboxless mode for Docker
ENV PUPPETEER_ARGS=--no-sandbox
# Unbuffer Node.js output
ENV NODE_OPTIONS="--no-deprecation"

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar el código
COPY src ./src
COPY prompts ./prompts
COPY index.js .

# Crear volúmenes para persistencia
VOLUME ["/app/.wwebjs_auth", "/app/.wwebjs_cache"]

# Exponer puerto para debugging (opcional)
EXPOSE 3000

CMD ["node", "index.js"]
