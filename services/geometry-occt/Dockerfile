FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_OPTIONS=--use-system-ca
ENV PORT=7080

# Workspace-aware install is done by CI/compose build context at repo root.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY services/geometry-occt ./services/geometry-occt
COPY tsconfig.base.json ./
COPY eslint.config.js ./

RUN corepack enable && pnpm install --filter @spds/geometry-occt... --frozen-lockfile
RUN pnpm --filter @spds/geometry-occt... build

EXPOSE 7080
CMD ["pnpm", "--filter", "@spds/geometry-occt", "start"]
