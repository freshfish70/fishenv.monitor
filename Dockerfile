# Runs the released `monitor.js` bundle on Deno. Nothing is compiled or copied
# from the build context — the image is a Deno runtime plus one downloaded
# bundle, so it stays small and the same image works for every release.

ARG DENO_VERSION=2.9.6

# --- fetch the release bundle -------------------------------------------------
FROM alpine:3.22 AS fetch

# "latest" tracks the newest GitHub release; set to a version ("0.1.0") to pin.
ARG MONITOR_VERSION=latest
ARG MONITOR_REPO=freshfish70/fishenv.monitor

RUN apk add --no-cache curl
RUN if [ "$MONITOR_VERSION" = "latest" ]; then \
      url="https://github.com/${MONITOR_REPO}/releases/latest/download/monitor.js"; \
    else \
      url="https://github.com/${MONITOR_REPO}/releases/download/v${MONITOR_VERSION}/monitor.js"; \
    fi; \
    echo "Fetching $url" && curl -fsSL --retry 3 -o /monitor.js "$url"

# --- runtime ------------------------------------------------------------------
FROM denoland/deno:alpine-${DENO_VERSION}

COPY --from=fetch /monitor.js /app/monitor.js

# Monitor configs are mounted here at runtime; the sqlite db lives in /app/data
# so it can be a named volume and survive image upgrades.
ENV FISHENV_MONITORS_GLOB="/app/monitors/**/*.ts" \
    FISHENV_DB_PATH="/app/data/monitor.sqlite" \
    FISHENV_MONITOR_PORT=8081 \
    DENO_DIR="/deno-dir"

RUN mkdir -p /app/monitors /app/data /deno-dir \
 && chown -R deno:deno /app /deno-dir

USER deno
WORKDIR /app
EXPOSE 8081
VOLUME ["/app/data"]

# Mounted monitor files are TypeScript resolved at runtime, so they are not part
# of the bundle's module graph and cannot be cached at build time. Their `jsr:`
# imports are fetched into DENO_DIR on first start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD deno eval --allow-net --allow-env \
      "const r = await fetch('http://localhost:' + (Deno.env.get('FISHENV_MONITOR_PORT') ?? '8081') + '/api/health'); Deno.exit(r.ok ? 0 : 1)"

ENTRYPOINT ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "/app/monitor.js"]
