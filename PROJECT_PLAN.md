compl## Plan: SaaS Growth Engine Monorepo

Build a runnable pnpm monorepo in the open workspace root, with NestJS v12, Angular v22 standalone, and Prisma ORM v8 against Neon PostgreSQL. Implement the full listed SaaS baseline with tenant isolation, Stripe-hosted billing flows, and an enterprise dashboard. Prisma v8 is currently documented as a release candidate, so treat its GA status and production support as an explicit launch gate rather than hiding the risk.

**Steps**

1. **Workspace foundation:** Create root pnpm workspace scripts and shared formatting/lint conventions; scaffold `/backend` and `/frontend`; pin compatible toolchain versions and commit the lockfile. Choose Node.js compatible with NestJS 12 and Angular 22 (their overlap includes Node 22.12+), validate package compatibility, and document that minimum.
2. **Backend platform and data model:** Scaffold modular NestJS 12 API modules for auth, users, organizations, billing, analytics, and audit logs. Configure validated environment settings, global strict `ValidationPipe`, `/api/docs` Swagger, throttling, CORS, security headers, health endpoint, and Prisma v8's current contract/client generation workflow. Define typed User, Organization, Subscription, Plan, and AuditLog records plus membership, refresh-token, verification/reset-token, invitation, and idempotent Stripe-event records. Use Neon pooled runtime and direct migration URLs as supported by Prisma v8's current guide.
3. **Identity and tenant authorization:** Implement signup, login, email verification, forgot/reset password, organization creation, and invite acceptance using a mock email adapter. Hash passwords and one-time tokens; issue short-lived access JWTs and rotate opaque refresh tokens in secure HttpOnly cookies. Resolve organization membership on protected requests, enforce Admin/Manager/Viewer permissions, and scope every tenant query by organization. Keep mock email token delivery development-only.
4. **User and audit workflows:** Add paginated tenant-scoped user/member CRUD, role updates and invitations. Write audit records for auth-sensitive and administrative changes with actor, organization, action, target, timestamp, and redacted metadata; expose a role-protected audit view. Restrict privileged role changes and organization-wide settings to Admin.
5. **Stripe billing and analytics:** Keep all Stripe operations server-side. Add plan listing, backend-created Checkout Sessions using configured Stripe Price IDs, Customer Portal sessions, and billing settings. Verify webhooks against the untouched raw request body and `Stripe-Signature`; persist event IDs for replay-safe idempotency. Handle `invoice.paid`, `customer.subscription.deleted`, and the subscription/payment status events needed to keep local access state coherent. Test MRR, churn, active subscription, and new-user aggregates against tenant/date filters; render chart series from those APIs.
6. **Angular product UI:** Build a responsive Linear-inspired admin shell with sidebar navigation, dense data tables, dashboard metrics/charts, user/invite management, plans, billing settings, and audit history. Add lazy-loaded standalone routes, an auth interceptor, auth/role guards, signal-based session and view state, Angular Material controls, Tailwind styling, accessible light/dark themes, loading/empty/error states, and sensible public-page metadata. Do not put payment calculations or secrets in the client.
7. **Production workflow and delivery:** Add ESLint/Prettier, Husky pre-commit hooks, lint-staged, CI checks, `.env.example`, and a README covering pnpm setup, Neon migrations, mock email behavior, Stripe configuration, deployment, and the exact Stripe CLI command `stripe listen --forward-to localhost:3000/billing/webhook`. Configure Angular production budgets and Vercel build/output settings; configure Render backend build/start/migration instructions and environment variables. Do not add Docker.
8. **Verification and launch gates:** Run install, format/lint, backend/frontend builds, unit tests (including billing service), and focused auth/tenant/webhook e2e tests. Add webhook signature rejection and duplicate-delivery tests plus cross-tenant/role-denial tests. Run Lighthouse against production builds for public auth pages and a seeded authenticated dashboard, tune accessibility/performance/SEO/best-practice findings toward 95+ per category, and document that SEO applies to public pages while private dashboard routes are `noindex`. Treat Prisma v8 reaching GA (or an explicit acceptance of RC risk) as required before production billing data is relied on.

**Relevant files**

- `d:/Documents/Portfolio Projects/Sass Engine/package.json` — root pnpm scripts and workspace tooling.
- `d:/Documents/Portfolio Projects/Sass Engine/pnpm-workspace.yaml` — workspace packages.
- `d:/Documents/Portfolio Projects/Sass Engine/backend/src/main.ts` — bootstrap, raw-body capture, global validation, Swagger, throttling, CORS, and security setup.
- `d:/Documents/Portfolio Projects/Sass Engine/backend/src/app.module.ts` — feature module registration.
- `d:/Documents/Portfolio Projects/Sass Engine/backend/prisma/` — Prisma v8 data contract, generated client configuration, migrations, and seed data.
- `d:/Documents/Portfolio Projects/Sass Engine/backend/src/auth/`, `users/`, `organizations/`, `billing/`, `analytics/`, `audit/` — feature modules, guards, services, controllers, and focused tests.
- `d:/Documents/Portfolio Projects/Sass Engine/frontend/src/app/` — standalone lazy routes, shell, pages, signal stores, guards, and interceptor.
- `d:/Documents/Portfolio Projects/Sass Engine/frontend/angular.json` — production build budgets and deployment build configuration.
- `d:/Documents/Portfolio Projects/Sass Engine/.env.example` — local and deployment environment variable names only, no secrets.
- `d:/Documents/Portfolio Projects/Sass Engine/README.md` — setup, Stripe CLI, Neon, tests, and deployment guide.

**Verification**

1. Install reproducibly with `pnpm install --frozen-lockfile`; run root lint, formatting check, backend/frontend typechecks and production builds.
2. Run billing unit tests for checkout session creation, portal session creation, invoice paid, subscription deletion, signature failures, and webhook idempotency.
3. Run API tests for auth token lifecycle, verification/reset/invitation expiry, RBAC denials, and cross-organization isolation.
4. Confirm generated Swagger at `/api/docs`, startup without Docker using Neon credentials, and Stripe CLI webhook forwarding at the documented path.
5. Run Lighthouse on production output at mobile and desktop sizes, using public auth pages and an authenticated seeded dashboard; tune against documented 95+ targets and avoid claiming the score until measured.

**Decisions**

- Use the current workspace root as the project root; do not add a nested `saas-growth-engine` directory.
- Implement a runnable full-feature baseline, not stubs.
- Use pnpm, NestJS v12, Angular latest stable (currently v22), Prisma v8, PostgreSQL on Neon, Stripe Billing, and no Docker.
- Honor Prisma v8 despite its current RC status; document and gate production rollout on GA or explicit risk acceptance.
- Use hosted Stripe Checkout and Customer Portal; Stripe secret keys and amounts/pricing authority remain backend-only.
- Treat tenant isolation, role checks, idempotent verified webhooks, redacted audit trails, and deployable environment configuration as production requirements.
- Vercel/Render configuration will be deploy-ready, but actual cloud deployment requires the user's account credentials, Neon database, and Stripe account settings.
