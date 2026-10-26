# ============ BUILD (kompilasi better-sqlite3) ============
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ sqlite-dev
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# ============ RUNTIME (image kecil) ============
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache tini sqlite-libs wget
COPY --from=build /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","server.js"]