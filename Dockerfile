FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 make g++ \
    && npm install --global bun@1.4.2 \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN export VENDURE_COOKIE_SECRET=docker-build-only-cookie-secret-32chars \
    SUPERADMIN_USERNAME=docker-build \
    SUPERADMIN_PASSWORD=docker-build-password \
    DB=postgres \
    DB_PASSWORD=docker-build-password \
    VENDURE_CORS_ORIGINS=http://localhost:3000 \
    VENDURE_STOREFRONT_URL=http://localhost:3000 \
    VENDURE_ASSET_UPLOAD_DIR=/app/assets \
    VENDURE_ASSET_URL_PREFIX=http://localhost:3000/assets/ \
    SMTP_HOST=localhost \
    EMAIL_FROM_ADDRESS='Vendure <noreply@example.test>' \
    VENDURE_VERIFY_EMAIL_URL=http://localhost:3000/account/verify \
    VENDURE_PASSWORD_RESET_URL=http://localhost:3000/account/reset-password \
    VENDURE_CHANGE_EMAIL_URL=http://localhost:3000/account/change-email \
    && bun install --frozen-lockfile \
    && bun run --cwd /app/packages/common build \
    && bun run --cwd /app/packages/core build \
    && bun run --cwd /app/packages/cli build \
    && bun run --cwd /app/packages/asset-server-plugin build \
    && bun run --cwd /app/packages/email-plugin build \
    && bun run --cwd /app/packages/telemetry-plugin build \
    && bun run --cwd /app/packages/dashboard build:vite \
    && bun run --cwd /app/packages/dashboard build:plugin \
    && bun run --cwd /app/packages/dev-server build

WORKDIR /app/packages/dev-server

EXPOSE 3000

CMD ["bun", "run", "start"]
