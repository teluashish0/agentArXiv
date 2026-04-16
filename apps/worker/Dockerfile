FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN corepack enable

WORKDIR /app

COPY . /app

RUN pnpm install --filter @agentarxiv/worker... --no-frozen-lockfile \
  && pnpm --filter @agentarxiv/db db:generate

CMD ["pnpm", "--dir", "apps/worker", "exec", "tsx", "src/index.ts"]
