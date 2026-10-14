FROM node:22-bookworm-slim AS node-runtime

FROM postgres:17-bookworm
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /worker
COPY worker.mjs ./worker.mjs

EXPOSE 8080
CMD ["node", "worker.mjs"]
