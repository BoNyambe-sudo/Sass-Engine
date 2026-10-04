# SaaS Growth Engine

Build and operate a pnpm monorepo rooted here, using NestJS 12, Angular 22
standalone, MongoDB with Mongoose, and Stripe Billing. MongoDB/Mongoose is the
authoritative persistence layer; PostgreSQL, Prisma, Neon connection settings,
migrations, and Prisma launch gates are intentionally excluded.

## Product baseline

1. **Workspace:** pnpm workspaces, Node 22.18+, repeatable lockfile, shared
   format/build/test commands, backend and frontend packages.
2. **API and data:** validated Nest configuration, MongoDB connection
   lifecycle, typed Mongoose schemas and indexes for users, organizations,
   memberships, subscriptions, refresh sessions, one-time tokens, invitations,
   audit records, and idempotent Stripe events. Strict DTO validation, Swagger,
   throttling, CORS, Helmet, health endpoint, and raw-body Stripe support.
3. **Identity and tenants:** signup/login, password recovery, email verification,
   invitation acceptance, bcrypt password hashing, hashed single-use tokens,
   short-lived JWT access credentials, rotated opaque refresh cookies, and
   Admin/Manager/Viewer authorization. Resolve membership on every protected
   request and scope tenant data by organization ID.
4. **Operations:** paginated member listing, invitations, role changes and
   removals, organization settings, minimum-one-admin protection, and
   organization-scoped redacted audit history.
5. **Billing and analytics:** server-created Stripe Checkout and Portal
   sessions; raw-body, signature-verified, replay-safe webhooks; subscription
   state synchronization; tenant/date-filtered MRR, churn, active subscription,
   and member growth data.
6. **Web client:** responsive Angular workspace shell with live overview,
   member administration, billing, audit history, and workspace settings.
   Show loading, empty and error states; support light/dark presentation. All
   access control and billing authority remains server-side.
7. **Delivery:** `.env.example`, setup/deployment documentation, Vercel and
   Render configuration, CI, lint, format, build and test commands. No Docker.

## Configuration and launch requirements

- Use a managed MongoDB service with TLS, backups, network controls, and a
  least-privilege database user for production. Mongoose schema indexes are
  created automatically outside production and must be provisioned before
  production deployment.
- Use `MONGODB_URI`; never use Postgres or Prisma connection variables.
- Configure a 32+ character random `JWT_SECRET`, restrict CORS to the deployed
  web origin, serve both applications over HTTPS, and set `NODE_ENV=production`.
- The mock email adapter is development-only. Production identity workflows
  use the configured Resend provider (`RESEND_API_KEY`, verified `EMAIL_FROM`).
- Configure Stripe live-mode keys, all Price IDs, success/cancel/portal URLs,
  and a webhook endpoint subscribed to checkout completion, subscription
  creation/update/deletion, invoice paid, and invoice payment failure events.
- The Stripe CLI local forwarding command is:
  `stripe listen --forward-to localhost:3000/billing/webhook`.
- Deployment credentials, production data, real Stripe events, and actual
  cloud behavior must be supplied and verified by the operator.

## Verification

Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`,
`pnpm test`, and `pnpm build`. Exercise auth/token expiry and rotation,
cross-organization access denial, role enforcement, Stripe signature rejection
and duplicate delivery, and billing aggregates with focused tests. Confirm
Swagger, health, webhook forwarding, and production deployment in configured
environments. Lighthouse scores must be measured before they are claimed;
private authenticated application screens should remain `noindex`.

## Relevant implementation

- `backend/src/main.ts` — raw webhook body, strict validation, API prefix,
  CORS, Helmet, Swagger, and startup.
- `backend/src/modules/database/` — Mongoose schemas, indexes, connection.
- `backend/src/modules/auth/` — identity, authentication context, role guards.
- `backend/src/modules/users/`, `organizations/`, `audit/` — scoped workspace
  operations and history.
- `backend/src/modules/billing/`, `analytics/` — Stripe and metrics APIs.
- `frontend/src/app/` — responsive authenticated workspace and API client.
- `.env.example`, `render.yaml`, `vercel.json`, `README.md` — environment and
  operator instructions.
