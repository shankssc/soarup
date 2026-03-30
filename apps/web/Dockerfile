# apps/web/Dockerfile - Next.js frontend (local dev focus)
# For production Cloudflare Pages deploy, we use @cloudflare/next-on-pages

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Health check (Next.js dev server responds on /)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Run dev server
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
