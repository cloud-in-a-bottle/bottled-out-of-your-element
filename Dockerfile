FROM node:22-bookworm-slim

# Upstream release to bridge with. Bump this to update OOYE; its database migrations run on start.
ARG OOYE_VERSION=v3.7

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${OOYE_VERSION}" https://gitdab.com/cadence/out-of-your-element /app/ooye && \
    cd /app/ooye && \
    npm ci --omit=dev && \
    npm cache clean --force

COPY bottle/ /app/bottle/

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "/app/bottle/main.js"]
