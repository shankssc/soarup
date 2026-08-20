# Handoff: Part 7 — Deployment Readiness
## (Pre-Deployment Hardening Milestone)

**Status as of this handoff:** Parts 1–6 of the pre-deployment-hardening
milestone are fully complete and merged into
`feature/milestone-pre-deployment-hardening`.

**⚠️ IMPORTANT — NOT YET MERGED INTO `develop`.** All work described
below and in the full milestone doc lives on
`feature/milestone-pre-deployment-hardening` only. That branch has
**not** been merged into `develop`. Do not assume any of this is live
or deployed anywhere — it's all still sitting on this one feature
branch, pending Part 7's completion before the final merge.

---

## Why this is being handed off

Part 7 (Deployment Readiness) is the last remaining section of this
milestone:

```
20. Resend domain verification — real email delivery, not just onboarding@resend.dev
21. Full environment variable audit — every required var documented and present in staging
22. Staging deployment
23. Smoke test on staging — walk all four E2E flows manually once live
```

Unlike Parts 1–6 (which were self-contained code/test work handled
in a scoped sub-chat), Part 7 depends on decisions that sit above the
scope of this branch-level work:

- **Resend domain verification (#20)** can't meaningfully be completed
  until a real deployment exists — DNS records need a real sending
  domain tied to a real deployed environment, not a placeholder.
- **Which branch triggers which deployment pipeline is unresolved.**
  Does pushing to `main` trigger a production deploy? Does a dedicated
  `staging` branch (based off `main`, or off `develop`?) trigger a
  staging deploy? This wasn't decided in this sub-chat and needs
  answering by whoever holds the actual deployment/environment
  strategy for the project.
- **Platform is believed-but-not-confirmed:** Railway for the API,
  Cloudflare Pages for the web frontend, based on passing references
  earlier in the milestone doc — but this sub-chat does not have
  authoritative context on the final decision, account setup status,
  or environment topology (single staging env? separate staging +
  production? preview deployments per PR?).

Given that, the recommendation is to let the main SoarUp planning
chat (with fuller project context) make these calls, rather than
guessing at deployment architecture from inside a milestone-execution
sub-chat.

---

## What the main chat needs to decide / provide

1. **Branch → environment mapping.** What branch (or branches) trigger
   what deploys? Where does `feature/milestone-pre-deployment-hardening`
   fit — does it merge to `develop` first, and does `develop` itself
   deploy anywhere, or only `main`?
2. **Platform confirmation.** Railway (API) + Cloudflare Pages (web) —
   confirm or correct.
3. **Domain for Resend.** What domain/subdomain will digest emails and
   other transactional emails send from (e.g. `mail.soarup.app`)? Who
   has DNS access to add the SPF/DKIM/DMARC records Resend requires?
4. **Environment variable inventory location.** Once a platform is
   confirmed, where do secrets get set (Railway env vars UI, Cloudflare
   Pages environment variables, a shared secrets manager)? This
   sub-chat can produce the *list* of required variables (see below),
   but needs to know where they actually get entered.

---

## What this sub-chat CAN still contribute once those decisions are made

- **A full environment variable audit (#21)** — going through
  `app/config.py` systematically to produce the complete list of every
  required setting this codebase now depends on, including several
  added during this milestone that may not yet be documented anywhere
  else:
  - `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_ENVIRONMENT`
    (Part 2)
  - `SENTRY_AUTH_TOKEN` — **required for staging source maps to upload
    correctly**; without it, Sentry stack traces from staging will
    show minified code instead of readable file/line info (flagged
    originally in Part 2, still outstanding)
  - `SLACK_ENCRYPTION_KEY` (pre-existing)
  - `UNSUBSCRIBE_SECRET_KEY` — **new in Part 6**, production-required,
    same enforcement pattern as `SLACK_ENCRYPTION_KEY`
  - `RATE_LIMIT_ENABLED` / `RATE_LIMIT_REQUESTS_PER_MINUTE` /
    `RATE_LIMIT_BURST` (Part 6, all have sane defaults so not strictly
    required to *set*, but worth knowing they exist)
  - Standard existing vars: `DATABASE_URL`, `REDIS_URL`,
    `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, R2/Minio credentials,
    `RESEND_API_KEY`, `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, etc.
- **Manual smoke test execution (#23)** once staging is actually live
  — walking the four E2E flows (signup/onboarding, text update
  submission, invite flow, voice update submission) by hand against
  the real staging URL.

---

## Reference

Full milestone documentation (Parts 1–6, complete write-ups,
acceptance criteria, Known Tradeoffs, file-by-file change lists) is
maintained separately — see
`SoarUp-Milestone-Pre-Deployment-Hardening.md`. That doc's Part 7
section and Known Tradeoffs already carry forward two notes relevant
here:

> `SENTRY_AUTH_TOKEN` must be added to Railway/Cloudflare's build-time
> env when this part is picked up, or staging source maps will not
> upload and Sentry stack traces from staging will show minified code
> instead of readable file/line info.

> `UNSUBSCRIBE_SECRET_KEY` must be included in the Part 7
> environment-variable audit — production-required, same enforcement
> pattern as `SLACK_ENCRYPTION_KEY`.
