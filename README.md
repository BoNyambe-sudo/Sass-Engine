# Northstar — SaaS Growth Engine

A pnpm monorepo for a tenant-aware SaaS administration and growth dashboard.
The API uses NestJS 12, MongoDB/Mongoose and Stripe Billing; the responsive
client is an Angular 22 standalone application.

## Requirements

- Node.js 22.18 or newer
- pnpm 12
- MongoDB 7+ (Atlas is recommended for production)
- Stripe account and Stripe CLI for local webhook development

## Local development

1. Copy `.env.example` to `.env`, set `MONGODB_URI`, and create a random
   `JWT_SECRET` of at least 32 characters. Configure Stripe test keys and Price
   IDs when testing billing.
2. Install the pinned workspace dependencies:

   ```sh
   pnpm install --frozen-lockfile
   ```

3. Start both applications in separate terminals, or run `pnpm dev`:

   ```sh
   pnpm dev:backend
   pnpm dev:frontend
   ```

   The Angular development server proxies `/api` requests to
   `http://localhost:3000`. The API health endpoint is `/api/health` and the
   Swagger UI is `/api/docs`.
4. MongoDB collections and indexes are created from the Mongoose schemas at
   startup. Production disables automatic index creation; apply the indexes
   declared in `backend/src/modules/database/models.ts` through your MongoDB
   deployment process before rollout.

Development email is deliberately mocked: verification, password-reset and
invitation tokens are logged by the API and exposed only in development
responses. Never enable this behavior in production or share development logs.
Production account email uses Resend; configure `RESEND_API_KEY` and a verified
`EMAIL_FROM` sender before enabling those account flows for real users.

## Stripe

Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and configured Stripe Price
IDs (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, and `STRIPE_PRICE_SCALE`)
to the backend environment. Configure the success, cancel, and billing portal
return URLs. Price IDs and all Stripe operations stay on the server.

The webhook endpoint intentionally bypasses the `/api` global prefix and
requires Stripe's signature over the untouched request body. For local
development, run:

```sh
stripe listen --forward-to localhost:3000/billing/webhook
```

Copy the signing secret printed by Stripe CLI into `STRIPE_WEBHOOK_SECRET`.
Webhook event IDs are persisted, processing is retryable after failures, and
completed duplicate deliveries are acknowledged without reapplying them.

## Workspace commands

```sh
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm format:check
```

## Production deployment

- **Database:** use MongoDB Atlas or another managed MongoDB deployment with
  TLS, authentication, backups, and network allowlisting. Use a least-privilege
  database user and do not commit `.env`.
- **API / Render:** `render.yaml` contains the backend build, start, and health
  check commands. Add the MongoDB URI, JWT secret, Stripe secrets/Price IDs,
  `FRONTEND_URL`, and `CORS_ORIGINS` to the Render service environment.
- **Web / Vercel:** `vercel.json` builds the Angular browser bundle and routes
  `/api/*` to the Render backend through the `BACKEND_HOST` environment
  variable. Configure the matching public frontend URL on the API service.
- Set `NODE_ENV=production`, use HTTPS, rotate all keys, restrict CORS to the
  deployed site, and verify Stripe webhook signatures before accepting live
  payments. The authenticated dashboard is private and should not be indexed.

Actual deployment requires the operator's MongoDB, Stripe, Vercel, and Render
accounts and credentials.

## Security and operational notes

- Access tokens are short-lived; opaque refresh tokens are rotated and stored
  only as hashes in secure HttpOnly cookies.
- Every protected request resolves a real organization membership. Member,
  subscription, analytics, and audit reads are scoped to that organization.
- Admin/Manager/Viewer permissions are enforced by the API, not only by the UI.
- Passwords use bcrypt; one-time tokens are hashed, expire, and can be consumed
  only once. Public request validation is strict and API requests are throttled.
- Stripe secret keys and billing authority never enter the browser bundle.
- Production logging should be shipped to a protected log store with retention
  and alerting configured by the operator.

Lighthouse, cloud deployments, live Stripe delivery, and MongoDB production
failover have not been measured from this workspace; do not treat them as
verified launch criteria.
