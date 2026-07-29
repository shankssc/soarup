// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? "local",

  tracesSampleRate: 0.1,

  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },

  // Explicit integrations list, replacing Sentry's default auto-detection.
  // Sentry's Node SDK ships instrumentation for ~15+ third-party libraries
  // (Postgres, MySQL, MongoDB, GraphQL, Prisma, Express, Fastify, etc.) and
  // bundles all of them by default, regardless of whether the app uses them.
  // This app's Next.js server only does outbound fetch() calls to the
  // FastAPI backend — no direct DB/ORM/framework integrations apply.
  integrations: [
    Sentry.httpIntegration(),
  ],
});
