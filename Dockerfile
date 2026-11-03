# Replyvoo production image.
# Zero npm dependencies, so there is no "npm install" step.
# Needs Node.js 22.13 or newer (built-in node:sqlite). node:22-alpine tracks the latest 22.x.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/replyvoo.db \
    TZ=UTC

WORKDIR /app

# Copy the app (see .dockerignore for what is left out: .env, data, backups, docs...)
COPY --chown=node:node . .

# Folders the app writes to. /app/data holds the SQLite database, /app/backups holds "npm run backup" files.
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups

# Note: no USER/VOLUME lines on purpose. Railway (and most PaaS) mount volumes as root and ignore
# Dockerfile VOLUME; attach a volume at /app/data in the host instead (see docs/DEPLOYMENT.md).
EXPOSE 3000

# /healthz returns 200. In maintenance mode it returns 503, which still means "the process is alive".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok||r.status===503?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
