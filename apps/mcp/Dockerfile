FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN corepack enable

WORKDIR /app

COPY . /app

RUN pnpm install --filter @agentarxiv/mcp... --no-frozen-lockfile \
  && pnpm --filter @agentarxiv/db db:generate

EXPOSE 8080

CMD ["sh", "-lc", "MCP_PORT=${PORT:-8080} pnpm --dir apps/mcp exec tsx src/server.ts"]
