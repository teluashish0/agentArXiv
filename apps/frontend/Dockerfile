FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://agentarxiv:agentarxiv@127.0.0.1:15432/agentarxiv?schema=public

RUN apt-get update -y \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app

COPY . /app

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_build
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm --filter @agentarxiv/frontend build

FROM node:22-bookworm-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app

COPY --from=build /app /app

EXPOSE 8080

CMD ["sh", "-lc", "pnpm --dir apps/frontend exec next start --hostname 0.0.0.0 --port ${PORT:-8080}"]
