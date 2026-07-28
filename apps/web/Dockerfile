# apps/web/Dockerfile - Next.js frontend (local dev focus)
# For production Cloudflare deploy, we use @opennextjs/cloudflare

FROM node:24.15-alpine

WORKDIR /app

RUN npm install -g npm@12.0.1

# Copy package files
COPY package.json package-lock.json* .npmrc* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

EXPOSE 3000
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
