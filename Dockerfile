FROM node:22-bookworm-slim AS app

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

ARG NPM_CONFIG_STRICT_SSL=true
ENV NPM_CONFIG_STRICT_SSL=${NPM_CONFIG_STRICT_SSL}

RUN npm install -g pnpm@10.4.1

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "start"]
